"use server";

import { isUuid, parseReason } from "@/domain/admin-input";
import { parseScoreInput } from "@/domain/results";
import { getDb } from "@/db/client";
import { type AdminFormState, runAdminAction } from "../admin/action-support";
import { AdminRuleError } from "../admin/common";
import { AuthorizationError } from "../staff-auth/access";
import { authorizeStaffAction } from "../staff-auth/current";
import { StaffAuthenticationError } from "../staff-auth/state";
import {
  type ScoreRowProblem,
  ScoreRowsError,
  finalizeClass,
  reopenSheet,
  saveSubjectScores,
  setPublication,
} from "./services";

/*
 * Result Server Actions. Each authenticates the staff member and checks its permission
 * on the server, validates every value, and delegates to a service that checks the
 * permission again, resolves the academic scope from the IDs and audits the change.
 */

export type SaveScoresResult =
  | { ok: true; saved: number; versions: Record<string, string> }
  | { ok: false; error: string; problems?: ScoreRowProblem[] };

/** Roster save, called from the score-entry screen (not a form post). */
export async function saveScoresAction(input: {
  termId: unknown;
  levelId: unknown;
  subjectId: unknown;
  reason?: unknown;
  rows: unknown;
}): Promise<SaveScoresResult> {
  let actor;
  try {
    actor = await authorizeStaffAction("results.enter");
  } catch (error) {
    if (error instanceof StaffAuthenticationError) return { ok: false, error: "signed_out" };
    return { ok: false, error: error instanceof AuthorizationError ? "forbidden" : "server" };
  }
  if (!isUuid(input.termId) || !isUuid(input.levelId) || !isUuid(input.subjectId))
    return { ok: false, error: "not_found" };
  if (!Array.isArray(input.rows) || input.rows.length === 0 || input.rows.length > 300)
    return { ok: false, error: "nothing_to_save" };

  const rows = [];
  const invalid: ScoreRowProblem[] = [];
  for (const raw of input.rows as Record<string, unknown>[]) {
    if (!raw || !isUuid(raw.enrollmentId)) return { ok: false, error: "not_found" };
    const ca = parseScoreInput(raw.ca);
    const exam = parseScoreInput(raw.exam);
    if (ca === "invalid")
      invalid.push({ enrollmentId: raw.enrollmentId, field: "ca", code: "score_out_of_range" });
    if (exam === "invalid")
      invalid.push({ enrollmentId: raw.enrollmentId, field: "exam", code: "score_out_of_range" });
    const version =
      typeof raw.version === "string" && raw.version.length <= 64 ? raw.version : null;
    rows.push({
      enrollmentId: raw.enrollmentId,
      ca: ca === "invalid" ? null : ca,
      exam: exam === "invalid" ? null : exam,
      version,
    });
  }
  if (invalid.length) return { ok: false, error: "score_out_of_range", problems: invalid };
  const reason =
    typeof input.reason === "string" ? input.reason.trim().slice(0, 500) || null : null;

  try {
    const result = await saveSubjectScores(getDb(), actor, {
      termId: input.termId,
      levelId: input.levelId,
      subjectId: input.subjectId,
      rows,
      reason,
    });
    return { ok: true, ...result };
  } catch (error) {
    if (error instanceof ScoreRowsError)
      return { ok: false, error: error.code, problems: error.problems };
    if (error instanceof AdminRuleError) return { ok: false, error: error.code };
    if (error instanceof AuthorizationError) return { ok: false, error: "forbidden" };
    console.error("Score save failed:", error instanceof Error ? error.name : "unknown");
    return { ok: false, error: "server" };
  }
}

const classPath = (termId: string, levelId: string, done: string) =>
  `/admin/results/${termId}/${levelId}?done=${done}`;

function scopeIds(values: Record<string, string>) {
  return {
    termId: isUuid(values.termId) ? values.termId : null,
    levelId: isUuid(values.levelId) ? values.levelId : null,
  };
}

export async function finalizeClassAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  return runAdminAction(formData, "results.enter", async ({ db, actor, values }) => {
    const { termId, levelId } = scopeIds(values);
    if (!termId || !levelId) return { error: "not_found" };
    if (values.confirm !== "on") return { error: "invalid", fieldErrors: { confirm: "required" } };
    const { finalized } = await finalizeClass(db, actor, {
      termId,
      levelId,
      includeIncomplete: values.includeIncomplete === "on",
    });
    return classPath(
      termId,
      levelId,
      finalized ? "results_finalized" : "results_nothing_finalized",
    );
  });
}

export async function reopenSheetAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  return runAdminAction(formData, "results.enter", async ({ db, actor, values }) => {
    const { termId, levelId } = scopeIds(values);
    if (!termId || !levelId) return { error: "not_found" };
    const enrollmentId = isUuid(values.enrollmentId) ? values.enrollmentId : null;
    const parsed = parseReason(values);
    if (!enrollmentId || !parsed.ok)
      return {
        error: "invalid",
        fieldErrors: {
          ...(enrollmentId ? {} : { enrollmentId: "required" as const }),
          ...(parsed.ok ? {} : parsed.errors),
        },
      };
    await reopenSheet(db, actor, { termId, levelId, enrollmentId, reason: parsed.data.reason });
    return classPath(termId, levelId, "results_reopened");
  });
}

/**
 * Publish or unpublish a class (levelId) or the whole school for a term (no levelId).
 * Always needs the confirmation tick; unpublishing needs a reason; publishing an
 * incomplete class needs the separate acknowledgement.
 */
export async function publicationAction(
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  return runAdminAction(formData, "results.publish", async ({ db, actor, values }) => {
    const termId = isUuid(values.termId) ? values.termId : null;
    if (!termId) return { error: "not_found" };
    const levelId = values.levelId ? (isUuid(values.levelId) ? values.levelId : undefined) : null;
    if (levelId === undefined) return { error: "not_found" };
    const publish = values.publish === "1";
    const confirmed = values.confirm === "on";
    const parsed = publish ? null : parseReason(values);
    if (!confirmed || (parsed && !parsed.ok))
      return {
        error: "invalid",
        fieldErrors: {
          ...(confirmed ? {} : { confirm: "required" as const }),
          ...(parsed && !parsed.ok ? parsed.errors : {}),
        },
      };
    await setPublication(db, actor, {
      termId,
      levelId,
      publish,
      reason: parsed?.ok ? parsed.data.reason : null,
      acknowledgeIncomplete: values.acknowledgeIncomplete === "on",
    });
    const done = `${levelId ? "results" : "results_school"}_${publish ? "published" : "unpublished"}`;
    return levelId
      ? classPath(termId, levelId, done)
      : `/admin/results?term=${termId}&done=${done}`;
  });
}
