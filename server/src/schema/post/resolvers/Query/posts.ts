import { getPosts } from "../../../../services/posts";
import type { QueryResolvers } from "./../../../types.generated";

export const posts: NonNullable<QueryResolvers['posts']> = async () =>
	getPosts();
