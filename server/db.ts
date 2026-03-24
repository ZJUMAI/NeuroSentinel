import { desc, eq, and, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  conversations,
  projects,
  messages,
  artifacts,
  executionLogs,
  fileAttachments,
  type Conversation,
  type InsertConversation,
  type InsertMessage,
  type InsertArtifact,
  type InsertExecutionLog,
  type InsertFileAttachment,
  type InsertProject,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ---- User Queries ----

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod", "passwordHash"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateUserProfile(userId: number, updates: { name?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const set: Record<string, unknown> = {};
  if (updates.name !== undefined) set.name = updates.name.trim() || null;
  if (Object.keys(set).length === 0) return;
  await db.update(users).set(set).where(eq(users.id, userId));
}

export async function createUserWithPassword(
  email: string,
  passwordHash: string,
  name?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const openId = `email:${email.toLowerCase().trim()}`;
  const existing = await getUserByOpenId(openId);
  if (existing) {
    throw new Error("该邮箱已注册");
  }
  await db.insert(users).values({
    openId,
    email: email.trim(),
    name: name?.trim() ?? email.trim(),
    passwordHash,
    loginMethod: "email",
    lastSignedIn: new Date(),
  });
  return getUserByOpenId(openId);
}

// ---- Conversation Queries ----

/** Columns that exist before migration 0004_projects (no `projectId`). */
const CONVERSATION_CORE_SELECT = {
  id: conversations.id,
  uniqueId: conversations.uniqueId,
  userId: conversations.userId,
  title: conversations.title,
  shareToken: conversations.shareToken,
  createdAt: conversations.createdAt,
  updatedAt: conversations.updatedAt,
};

function isMissingProjectIdColumnError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /Unknown column[^'"]*['`]?projectId/i.test(msg);
}

function isProjectsTableMissingError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /doesn't exist/i.test(msg) && /projects/i.test(msg);
}

function withNullProjectId(row: Omit<Conversation, "projectId">): Conversation {
  return { ...row, projectId: null };
}

async function selectConversationByUniqueId(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, uniqueId: string) {
  try {
    const result = await db
      .select()
      .from(conversations)
      .where(eq(conversations.uniqueId, uniqueId))
      .limit(1);
    return result[0];
  } catch (err) {
    if (!isMissingProjectIdColumnError(err)) throw err;
    const result = await db
      .select(CONVERSATION_CORE_SELECT)
      .from(conversations)
      .where(eq(conversations.uniqueId, uniqueId))
      .limit(1);
    const row = result[0];
    return row ? withNullProjectId(row) : undefined;
  }
}

export async function createConversation(data: InsertConversation) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  try {
    await db.insert(conversations).values(data);
  } catch (err) {
    if (!isMissingProjectIdColumnError(err)) throw err;
    const { projectId: omittedPid, ...rest } = data as InsertConversation & { projectId?: number | null };
    await db.insert(conversations).values(rest as InsertConversation);
    if (omittedPid != null) {
      console.warn(
        "[Database] conversations.projectId not in DB; conversation created without project. Run drizzle/0004_projects.sql for project features."
      );
    }
  }
  const row = await selectConversationByUniqueId(db, data.uniqueId);
  if (!row) throw new Error("Failed to read conversation after insert");
  return row;
}

export async function getUserConversations(userId: number) {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(desc(conversations.updatedAt));
  } catch (err) {
    if (!isMissingProjectIdColumnError(err)) throw err;
    console.warn(
      "[Database] conversations.projectId missing — listing without it. Run drizzle/0004_projects.sql to enable projects."
    );
    const rows = await db
      .select(CONVERSATION_CORE_SELECT)
      .from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(desc(conversations.updatedAt));
    return rows.map((r) => withNullProjectId(r));
  }
}

// ---- Project Queries ----

export async function createProject(data: InsertProject) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const ins = await db.insert(projects).values(data);
  const id = Number(ins[0].insertId);
  const row = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  return row[0];
}

export async function getProjectById(id: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const r = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .limit(1);
  return r[0];
}

export async function listUserProjectsWithTaskCounts(userId: number) {
  const db = await getDb();
  if (!db) return [];
  try {
    const projs = await db
      .select()
      .from(projects)
      .where(eq(projects.userId, userId))
      .orderBy(desc(projects.updatedAt));
    const countRows = await db
      .select({
        projectId: conversations.projectId,
        n: sql<number>`cast(count(*) as signed)`.mapWith(Number),
      })
      .from(conversations)
      .where(eq(conversations.userId, userId))
      .groupBy(conversations.projectId);
    const map = new Map<number, number>();
    for (const r of countRows) {
      if (r.projectId != null) map.set(r.projectId, r.n);
    }
    return projs.map((p) => ({ ...p, taskCount: map.get(p.id) ?? 0 }));
  } catch (err) {
    if (isProjectsTableMissingError(err) || isMissingProjectIdColumnError(err)) {
      console.warn(
        "[Database] projects / projectId schema missing; empty project list until drizzle/0004_projects.sql is applied."
      );
      return [];
    }
    throw err;
  }
}

export async function updateProject(
  id: number,
  userId: number,
  updates: { name?: string; context?: string | null }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getProjectById(id, userId);
  if (!existing) throw new Error("Project not found");
  const set: Record<string, unknown> = {};
  if (updates.name !== undefined) set.name = updates.name.trim() || "Untitled";
  if (updates.context !== undefined) set.context = updates.context;
  if (Object.keys(set).length === 0) return;
  await db.update(projects).set(set).where(and(eq(projects.id, id), eq(projects.userId, userId)));
}

export async function deleteProject(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(projects).where(and(eq(projects.id, id), eq(projects.userId, userId)));
}

export async function setConversationProject(
  uniqueId: string,
  userId: number,
  projectId: number | null
) {
  const conv = await getConversation(uniqueId, userId);
  if (!conv) throw new Error("Conversation not found");
  if (projectId !== null) {
    const p = await getProjectById(projectId, userId);
    if (!p) throw new Error("Project not found");
  }
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(conversations)
    .set({ projectId })
    .where(eq(conversations.id, conv.id));
}

/** Shared project instructions for agent system prompt (conversation must belong to a project). */
export async function getProjectContextForConversation(
  conversationId: number
): Promise<{ name: string; context: string | null } | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const rows = await db
      .select({ name: projects.name, context: projects.context })
      .from(conversations)
      .innerJoin(projects, eq(conversations.projectId, projects.id))
      .where(eq(conversations.id, conversationId))
      .limit(1);
    return rows[0] ?? null;
  } catch (err) {
    if (isProjectsTableMissingError(err) || isMissingProjectIdColumnError(err)) {
      return null;
    }
    throw err;
  }
}

export async function getConversation(uniqueId: string, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  try {
    const result = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.uniqueId, uniqueId), eq(conversations.userId, userId)))
      .limit(1);
    return result[0];
  } catch (err) {
    if (!isMissingProjectIdColumnError(err)) throw err;
    const result = await db
      .select(CONVERSATION_CORE_SELECT)
      .from(conversations)
      .where(and(eq(conversations.uniqueId, uniqueId), eq(conversations.userId, userId)))
      .limit(1);
    const row = result[0];
    return row ? withNullProjectId(row) : undefined;
  }
}

export async function getConversationById(conversationId: number) {
  const db = await getDb();
  if (!db) return undefined;
  try {
    const result = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    return result[0];
  } catch (err) {
    if (!isMissingProjectIdColumnError(err)) throw err;
    const result = await db
      .select(CONVERSATION_CORE_SELECT)
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    const row = result[0];
    return row ? withNullProjectId(row) : undefined;
  }
}

export async function updateConversationTitle(uniqueId: string, userId: number, title: string) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(conversations)
    .set({ title })
    .where(and(eq(conversations.uniqueId, uniqueId), eq(conversations.userId, userId)));
}

export async function deleteConversation(uniqueId: string, userId: number) {
  const db = await getDb();
  if (!db) return;
  const conv = await getConversation(uniqueId, userId);
  if (!conv) return;
  await db.delete(fileAttachments).where(eq(fileAttachments.conversationId, conv.id));
  await db.delete(executionLogs).where(eq(executionLogs.conversationId, conv.id));
  await db.delete(artifacts).where(eq(artifacts.conversationId, conv.id));
  await db.delete(messages).where(eq(messages.conversationId, conv.id));
  await db.delete(conversations).where(eq(conversations.id, conv.id));
}

// ---- Share Token Queries ----

export async function setConversationShareToken(
  uniqueId: string,
  userId: number,
  shareToken: string
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(conversations)
    .set({ shareToken })
    .where(and(eq(conversations.uniqueId, uniqueId), eq(conversations.userId, userId)));
}

export async function removeConversationShareToken(uniqueId: string, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(conversations)
    .set({ shareToken: null })
    .where(and(eq(conversations.uniqueId, uniqueId), eq(conversations.userId, userId)));
}

export async function getConversationByShareToken(shareToken: string) {
  const db = await getDb();
  if (!db) return undefined;
  try {
    const result = await db
      .select()
      .from(conversations)
      .where(eq(conversations.shareToken, shareToken))
      .limit(1);
    return result[0];
  } catch (err) {
    if (!isMissingProjectIdColumnError(err)) throw err;
    const result = await db
      .select(CONVERSATION_CORE_SELECT)
      .from(conversations)
      .where(eq(conversations.shareToken, shareToken))
      .limit(1);
    const row = result[0];
    return row ? withNullProjectId(row) : undefined;
  }
}

// ---- Message Queries ----

export async function createMessage(data: InsertMessage) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(messages).values(data);
  return { id: Number(result[0].insertId), ...data };
}

export async function getConversationMessages(conversationId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt);
}

export async function updateMessageContent(messageId: number, content: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(messages).set({ content }).where(eq(messages.id, messageId));
}

// ---- Artifact Queries ----

export async function createArtifact(data: InsertArtifact) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(artifacts).values(data);
  return { id: Number(result[0].insertId), ...data };
}

export async function getConversationArtifacts(conversationId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(artifacts)
    .where(eq(artifacts.conversationId, conversationId))
    .orderBy(desc(artifacts.createdAt));
}

/** 知识库：当前用户全部会话下的工件元数据（内容仅取前缀，避免大字段） */
export async function getUserLibraryArtifactRows(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      artifactId: artifacts.id,
      artifactType: artifacts.type,
      artifactTitle: artifacts.title,
      artifactCreatedAt: artifacts.createdAt,
      contentPreview: sql<string | null>`CASE ${artifacts.type}
        WHEN 'experiment_questionnaire' THEN LEFT(${artifacts.content}, 48000)
        WHEN 'project_plan' THEN LEFT(${artifacts.content}, 120000)
        WHEN 'assessment_report' THEN LEFT(${artifacts.content}, 120000)
        WHEN 'analysis_result' THEN LEFT(${artifacts.content}, 120000)
        WHEN 'markdown' THEN LEFT(${artifacts.content}, 16000)
        WHEN 'document' THEN LEFT(${artifacts.content}, 16000)
        ELSE LEFT(${artifacts.content}, 600)
      END`,
      conversationUniqueId: conversations.uniqueId,
      conversationTitle: conversations.title,
      conversationUpdatedAt: conversations.updatedAt,
    })
    .from(artifacts)
    .innerJoin(conversations, eq(artifacts.conversationId, conversations.id))
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.updatedAt), desc(artifacts.createdAt));
}

export async function getArtifact(artifactId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(artifacts).where(eq(artifacts.id, artifactId)).limit(1);
  return result[0] || null;
}

export async function updateArtifact(artifactId: number, content: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(artifacts).set({ content }).where(eq(artifacts.id, artifactId));
}

export async function deleteArtifact(artifactId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const artifact = await getArtifact(artifactId);
  if (!artifact) throw new Error("Artifact not found");
  const userConvs = await getUserConversations(userId);
  const hasAccess = userConvs.some((c) => c.id === artifact.conversationId);
  if (!hasAccess) throw new Error("Access denied");
  await db.delete(artifacts).where(eq(artifacts.id, artifactId));
}

// ---- Execution Log Queries ----

export async function createExecutionLog(data: InsertExecutionLog) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(executionLogs).values(data);
  return { id: Number(result[0].insertId), ...data };
}

export async function getConversationExecutionLogs(conversationId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(executionLogs)
    .where(eq(executionLogs.conversationId, conversationId))
    .orderBy(desc(executionLogs.createdAt));
}

// ---- File Attachment Queries ----

export async function createFileAttachment(data: InsertFileAttachment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(fileAttachments).values(data);
  return { id: Number(result[0].insertId), ...data };
}

export async function getConversationFiles(conversationId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(fileAttachments)
    .where(eq(fileAttachments.conversationId, conversationId))
    .orderBy(desc(fileAttachments.createdAt));
}

export async function getUserFileByConversation(conversationId: number, userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(fileAttachments)
    .where(
      and(
        eq(fileAttachments.conversationId, conversationId),
        eq(fileAttachments.userId, userId)
      )
    )
    .orderBy(desc(fileAttachments.createdAt));
}
