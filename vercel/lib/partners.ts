import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { designPartners } from "@/db/schema";

export async function getPartners() {
  const db = getDb();
  return db.select().from(designPartners).orderBy(designPartners.dateJoined);
}

export async function createPartner(data: {
  studioName: string;
  contact?: string;
  game?: string;
  steamPageUrl?: string;
  devStage?: string;
  recruitedVia?: string;
  validating?: string;
}) {
  const db = getDb();
  const [row] = await db
    .insert(designPartners)
    .values({
      studioName: data.studioName,
      contact: data.contact || null,
      game: data.game || null,
      steamPageUrl: data.steamPageUrl || null,
      devStage: data.devStage || null,
      recruitedVia: data.recruitedVia || null,
      validating: data.validating || null,
    })
    .returning();
  return row;
}

export async function updatePartner(
  id: string,
  patch: { status?: string; quotePermission?: string; validating?: string },
) {
  const db = getDb();
  await db.update(designPartners).set(patch).where(eq(designPartners.id, id));
}

export async function deletePartner(id: string) {
  const db = getDb();
  await db.delete(designPartners).where(eq(designPartners.id, id));
}
