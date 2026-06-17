import { existsSync, readFileSync, writeFileSync } from "fs";

export type BazaarTier = "FREE" | "BASIC" | "PRO";

export interface SkillRecord {
  skillId: number;
  owner: string;
  name: string;
  version: string;
  endpoint: string;
  metadataURI: string;
  erc8004AgentId: number;
  registeredAt: number;
  totalJobs: number;
  averageScore: number;
  pricePerCallBps: number;
  tier: BazaarTier;
  tierPaidUntil: number;
  active: boolean;
  lastUpdated: number;
}

const DB_PATH = process.env.INDEXER_DB_PATH ?? "./skill_db.json";

export function loadDb(): Record<number, SkillRecord> {
  if (!existsSync(DB_PATH)) return {};
  return JSON.parse(readFileSync(DB_PATH, "utf-8")) as Record<number, SkillRecord>;
}

export function saveDb(db: Record<number, SkillRecord>): void {
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

export function upsertSkill(db: Record<number, SkillRecord>, skill: SkillRecord): void {
  db[skill.skillId] = skill;
  saveDb(db);
}
