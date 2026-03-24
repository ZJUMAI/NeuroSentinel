/**
 * 实验方案时间表：基于开始时间计算各步骤的时间点，支持弹窗提醒
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type { ProjectPlanData, ProjectPlanDay } from "../../../shared/types";

const STORAGE_KEY_PREFIX = "manus-schedule-";
const NOTIFY_MINUTES_BEFORE = 5; // 提前 5 分钟提醒
const POLL_INTERVAL_MS = 60_000; // 每分钟检查一次
const TICK_INTERVAL_MS = 30_000; // 每 30 秒刷新一次，实现到点自动更新

/** 将时间标签解析为分钟数。时间表示步骤硬性需要的处理/培养时长，非操作预估时间。 */
function parseDurationToMinutes(label: string): number {
  if (!label || label === "即时") return 0;
  if (/过夜|隔夜|overnight/i.test(label)) return 12 * 60; // 12 小时
  // "0-60 min" 等区间格式（旧方案可能残留）：取较大值作为步骤所需时长
  const rangeMinMatch = label.match(/(\d+)\s*-\s*(\d+)\s*min/);
  if (rangeMinMatch) {
    const a = parseInt(rangeMinMatch[1], 10);
    const b = parseInt(rangeMinMatch[2], 10);
    return Math.max(a, b);
  }
  const minMatch = label.match(/(\d+)\s*min/);
  if (minMatch) return parseInt(minMatch[1], 10);
  const hourMatch = label.match(/(\d+)\s*h/);
  if (hourMatch) return parseInt(hourMatch[1], 10) * 60;
  return 0;
}

/** 从步骤文本提取时间标签（与 ProjectPlanViewer 逻辑一致） */
function getTimeLabel(step: string, stepTimelineValue?: string): string {
  if (stepTimelineValue && stepTimelineValue !== "—") return stepTimelineValue;
  const t = step.trim();
  if (/过夜|隔夜|培养一夜|培养过夜| overnight/i.test(t)) return "过夜";
  const minMatch = t.match(/(\d+)\s*分钟?/);
  if (minMatch) return `${minMatch[1]} min`;
  const hourMatch = t.match(/(\d+)\s*小时?/);
  if (hourMatch) return `${hourMatch[1]} h`;
  if (/半小时|0\.5\s*小时/.test(t)) return "30 min";
  const minAfter = t.match(/(\d+)\s*分钟后?/);
  if (minAfter) return `${minAfter[1]} min`;
  return "即时";
}

export type StepSchedule = {
  stepIndex: number;
  stepText: string;
  timeLabel: string;
  startMinutes: number; // 从实验开始算起的分钟数
  endMinutes: number;
  startTime: Date; // 实际开始时间
  endTime: Date;
};

export type DaySchedule = {
  dayIndex: number;
  day: ProjectPlanDay;
  steps: StepSchedule[];
};

export type ScheduleState = {
  startTime: number;
  dayIndex: number;
  /** 已确认的最后一步索引，-1 表示尚未确认任何步骤 */
  confirmedStepIndex: number;
  /** 确认该步骤时的时间戳，用于计算持续时间是否已过 */
  confirmedAt: number;
};

export function useProjectPlanSchedule(
  planData: ProjectPlanData | null,
  artifactId?: number
) {
  const [scheduleState, setScheduleState] = useState<ScheduleState | null>(null);
  const [notifyStep, setNotifyStep] = useState<{ dayIndex: number; stepIndex: number; stepText: string } | null>(null);
  const [tick, setTick] = useState(0); // 用于到点自动刷新
  const notifiedRef = useRef<string | null>(null);

  const storageKey = artifactId != null ? `${STORAGE_KEY_PREFIX}${artifactId}` : null;

  // 从 localStorage 恢复
  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ScheduleState>;
        if (parsed.startTime && typeof parsed.dayIndex === "number") {
          setScheduleState({
            startTime: parsed.startTime,
            dayIndex: parsed.dayIndex,
            confirmedStepIndex: typeof parsed.confirmedStepIndex === "number" ? parsed.confirmedStepIndex : -1,
            confirmedAt: typeof parsed.confirmedAt === "number" ? parsed.confirmedAt : 0,
          });
        }
      }
    } catch {
      // ignore
    }
  }, [storageKey]);

  const startSchedule = useCallback(
    (dayIndex: number) => {
      notifiedRef.current = null;
      const state: ScheduleState = {
        startTime: Date.now(),
        dayIndex,
        confirmedStepIndex: -1,
        confirmedAt: 0,
      };
      setScheduleState(state);
      if (storageKey) {
        localStorage.setItem(storageKey, JSON.stringify(state));
      }
    },
    [storageKey]
  );

  const stopSchedule = useCallback(() => {
    setScheduleState(null);
    setNotifyStep(null);
    if (storageKey) {
      localStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  // 构建某天的时间表
  const buildDaySchedule = useCallback(
    (dayIndex: number): DaySchedule | null => {
      if (!planData?.days?.[dayIndex]) return null;
      const day = planData.days[dayIndex];
      const tl = day.stepTimeline ?? day.steps.map(() => "—");
      const steps: StepSchedule[] = [];
      let cumulMinutes = 0;
      const startTime = scheduleState?.startTime ? new Date(scheduleState.startTime) : new Date();

      for (let i = 0; i < day.steps.length; i++) {
        const timeLabel =
          (tl[i] && tl[i] !== "—") ? tl[i] : getTimeLabel(day.steps[i], tl[i]);
        const duration = parseDurationToMinutes(timeLabel);
        const stepStart = cumulMinutes;
        const stepEnd = cumulMinutes + duration;

        steps.push({
          stepIndex: i,
          stepText: day.steps[i],
          timeLabel,
          startMinutes: stepStart,
          endMinutes: stepEnd,
          startTime: new Date(startTime.getTime() + stepStart * 60 * 1000),
          endTime: new Date(startTime.getTime() + stepEnd * 60 * 1000),
        });

        cumulMinutes = stepEnd;
      }

      return { dayIndex, day, steps };
    },
    [planData, scheduleState?.startTime]
  );

  // 获取当前应执行的步骤（基于用户确认；有持续时间的步骤需等待时长过后才进入下一步）
  const getCurrentStep = useCallback(
    (dayIndex: number): StepSchedule | null => {
      const daySched = buildDaySchedule(dayIndex);
      if (!daySched || !scheduleState) return null;
      if (scheduleState.confirmedStepIndex < 0) return daySched.steps[0] ?? null;
      const confirmed = daySched.steps[scheduleState.confirmedStepIndex];
      if (!confirmed) return daySched.steps[scheduleState.confirmedStepIndex + 1] ?? null;
      const durationMs = parseDurationToMinutes(confirmed.timeLabel) * 60 * 1000;
      const elapsed = Date.now() - scheduleState.confirmedAt;
      if (durationMs > 0 && elapsed < durationMs) return confirmed; // 仍在等待该步骤的持续时间
      return daySched.steps[scheduleState.confirmedStepIndex + 1] ?? null;
    },
    [buildDaySchedule, scheduleState]
  );

  // 获取下一步（含所属天数，用于本日完成时显示次日步骤）
  const getNextStepWithDay = useCallback(
    (dayIndex: number): { step: StepSchedule; dayIndex: number } | null => {
      const current = getCurrentStep(dayIndex);
      const daySched = buildDaySchedule(dayIndex);
      if (!daySched) return null;
      if (!current) {
        // 本日步骤已全部完成，下一步为次日第一步
        const nextDaySched = buildDaySchedule(dayIndex + 1);
        const first = nextDaySched?.steps[0];
        return first ? { step: first, dayIndex: dayIndex + 1 } : null;
      }
      const idx = daySched.steps.findIndex((s) => s.stepIndex === current.stepIndex);
      const nextStep = daySched.steps[idx + 1];
      return nextStep ? { step: nextStep, dayIndex } : null;
    },
    [buildDaySchedule, getCurrentStep]
  );

  const getNextStep = useCallback(
    (dayIndex: number): StepSchedule | null => getNextStepWithDay(dayIndex)?.step ?? null,
    [getNextStepWithDay]
  );

  // 下一步的预计开始时间（随确认延迟动态顺延）
  const getNextStepExpectedStart = useCallback(
    (dayIndex: number): Date | null => {
      const nextWithDay = getNextStepWithDay(dayIndex);
      const daySched = buildDaySchedule(dayIndex);
      if (!nextWithDay || !scheduleState || !daySched) return null;
      const { step: next, dayIndex: nextDayIndex } = nextWithDay;
      const baseMs =
        scheduleState.confirmedStepIndex >= 0 && scheduleState.confirmedAt > 0
          ? scheduleState.confirmedAt
          : scheduleState.startTime;
      if (nextDayIndex > dayIndex) {
        // 下一步为次日，预计明日开始（+24h）
        return new Date(baseMs + 24 * 60 * 60 * 1000);
      }
      const lastIdx = scheduleState.confirmedStepIndex >= 0 ? scheduleState.confirmedStepIndex : -1;
      let cumulMs = 0;
      for (let i = lastIdx; i < next.stepIndex; i++) {
        const s = daySched.steps[i];
        if (s) cumulMs += parseDurationToMinutes(s.timeLabel) * 60 * 1000;
      }
      return new Date(baseMs + cumulMs);
    },
    [getNextStepWithDay, buildDaySchedule, scheduleState]
  );

  // 到点自动刷新：每 30 秒更新一次，使时间表自动更新当前步骤
  useEffect(() => {
    if (!scheduleState) return;
    const id = setInterval(() => setTick((t) => t + 1), TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [scheduleState]);

  // 检查是否需要弹窗提醒
  useEffect(() => {
    if (!scheduleState || !planData) return;

    const dayIndex = scheduleState.dayIndex;
    const daySched = buildDaySchedule(dayIndex);
    if (!daySched) return;

    const check = () => {
      const now = Date.now();
      const notifyThreshold = NOTIFY_MINUTES_BEFORE * 60 * 1000;

      for (const step of daySched.steps) {
        const startMs = step.startTime.getTime();
        const diff = startMs - now;
        const key = `${dayIndex}-${step.stepIndex}`;
        // 在步骤开始前 5 分钟内，且尚未超过开始时间，且未提醒过
        if (diff > 0 && diff <= notifyThreshold && notifiedRef.current !== key) {
          notifiedRef.current = key;
          setNotifyStep({
            dayIndex,
            stepIndex: step.stepIndex,
            stepText: step.stepText,
          });
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            new Notification("实验步骤提醒", {
              body: `步骤 ${step.stepIndex + 1} 即将开始：${step.stepText.slice(0, 80)}${step.stepText.length > 80 ? "…" : ""}`,
              icon: "/favicon.ico",
            });
          }
          return;
        }
      }
    };

    check();
    const id = setInterval(check, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [scheduleState, planData, buildDaySchedule]);

  const dismissNotify = useCallback(() => setNotifyStep(null), []);

  // 用户确认当前步骤，记录时间；有持续时间的步骤需等待时长过后才自动进入下一步
  const confirmStep = useCallback(
    (dayIndex: number) => {
      if (!scheduleState || scheduleState.dayIndex !== dayIndex) return;
      const daySched = buildDaySchedule(dayIndex);
      if (!daySched) return;
      const current = getCurrentStep(dayIndex);
      if (!current) return; // 已全部完成
      const newState: ScheduleState = {
        ...scheduleState,
        confirmedStepIndex: current.stepIndex,
        confirmedAt: Date.now(),
      };
      setScheduleState(newState);
      if (storageKey) {
        localStorage.setItem(storageKey, JSON.stringify(newState));
      }
    },
    [scheduleState, buildDaySchedule, getCurrentStep, storageKey]
  );

  // 当前步骤是否可点击确认（未确认且不在等待持续时间的阶段）
  const canConfirmCurrentStep = useCallback(
    (dayIndex: number): boolean => {
      const current = getCurrentStep(dayIndex);
      if (!current || !scheduleState || scheduleState.dayIndex !== dayIndex) return false;
      return scheduleState.confirmedStepIndex < current.stepIndex;
    },
    [getCurrentStep, scheduleState]
  );

  return {
    scheduleState,
    notifyStep,
    startSchedule,
    stopSchedule,
    confirmStep,
    canConfirmCurrentStep,
    buildDaySchedule,
    getCurrentStep,
    getNextStep,
    getNextStepWithDay,
    getNextStepExpectedStart,
    dismissNotify,
  };
}
