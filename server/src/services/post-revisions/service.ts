import { asc, eq } from "drizzle-orm";
import { db } from "../../db";
import { postRevisions } from "../../db/schema";
import type { Post, PostRevision } from "../../schema/types.generated";
import { getPost } from "../posts";

const timestamp = (value: Date) => Math.floor(value.getTime() / 1000);

const toPostRevision = (
	revision: typeof postRevisions.$inferSelect,
	post: Post,
): PostRevision => ({
	id: revision.id,
	revisionNumber: revision.revisionNumber,
	title: revision.title,
	markdownContent: revision.markdownContent,
	createdAt: timestamp(revision.createdAt),
	post,
});

export const getPostRevision = async (id: string) => {
	const [revision] = await db
		.select()
		.from(postRevisions)
		.where(eq(postRevisions.id, id));
	if (!revision) return null;

	const post = await getPost(revision.postId);
	if (!post) throw new Error("Post revision references a missing post");
	return toPostRevision(revision, post);
};

export const getPostRevisions = async (post: Post) => {
	const results = await db
		.select()
		.from(postRevisions)
		.where(eq(postRevisions.postId, post.id))
		.orderBy(asc(postRevisions.revisionNumber));
	return results.map((revision) => toPostRevision(revision, post));
};
