import { int, json, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  /** bcrypt hash for email/password login; null for OAuth users */
  passwordHash: varchar("passwordHash", { length: 255 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Projects — group tasks under one theme; shared instructions (context) apply to all tasks in the project.
 */
export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 500 }).notNull(),
  /** Persistent instructions: tech stack, style, background — injected into the agent system prompt */
  context: text("context"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

/**
 * Conversations table - each conversation is a session with the agent.
 */
export const conversations = mysqlTable("conversations", {
  id: int("id").autoincrement().primaryKey(),
  uniqueId: varchar("uniqueId", { length: 36 }).notNull().unique(),
  userId: int("userId").notNull(),
  /** Optional project grouping; null = global / ungrouped task */
  projectId: int("projectId"),
  title: varchar("title", { length: 500 }).default("New Conversation").notNull(),
  /** Optional public share token for read-only sharing */
  shareToken: varchar("shareToken", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;

/**
 * Messages table - stores all messages in a conversation.
 * role: user | assistant | system | tool
 * type: text | plan | tool_call | tool_result | status | error
 */
export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  role: varchar("role", { length: 20 }).notNull(),
  type: varchar("type", { length: 30 }).default("text").notNull(),
  content: text("content"),
  metadata: json("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

/**
 * Artifacts table - stores generated content (code, charts, HTML, documents).
 */
export const artifacts = mysqlTable("artifacts", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  messageId: int("messageId"),
  type: varchar("type", { length: 30 }).notNull(),
  title: varchar("title", { length: 500 }),
  content: text("content"),
  language: varchar("language", { length: 30 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Artifact = typeof artifacts.$inferSelect;
export type InsertArtifact = typeof artifacts.$inferInsert;

/**
 * Execution logs - tracks code execution results from the sandbox.
 */
export const executionLogs = mysqlTable("executionLogs", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  messageId: int("messageId"),
  status: varchar("status", { length: 20 }).notNull(),
  code: text("code"),
  stdout: text("stdout"),
  stderr: text("stderr"),
  images: json("images"),
  executionTimeMs: int("executionTimeMs"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ExecutionLog = typeof executionLogs.$inferSelect;
export type InsertExecutionLog = typeof executionLogs.$inferInsert;

/**
 * File attachments - stores references to uploaded files in S3.
 */
export const fileAttachments = mysqlTable("fileAttachments", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  userId: int("userId").notNull(),
  /** Original file name as uploaded by user */
  fileName: varchar("fileName", { length: 500 }).notNull(),
  /** S3 storage key */
  fileKey: varchar("fileKey", { length: 1000 }).notNull(),
  /** Public URL from S3 */
  fileUrl: varchar("fileUrl", { length: 2000 }).notNull(),
  /** MIME type */
  mimeType: varchar("mimeType", { length: 200 }).notNull(),
  /** File size in bytes */
  fileSize: int("fileSize").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FileAttachment = typeof fileAttachments.$inferSelect;
export type InsertFileAttachment = typeof fileAttachments.$inferInsert;
