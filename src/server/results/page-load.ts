import "server-only";
import { notFound } from "next/navigation";
import { AdminRuleError } from "../admin/common";

/**
 * For result pages: a scope the URL names but the rules refuse (unknown or legacy term,
 * a subject outside the level's curriculum, a term not open yet) is a 404, not a crash.
 */
export async function orNotFound<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    if (error instanceof AdminRuleError) notFound();
    throw error;
  }
}
