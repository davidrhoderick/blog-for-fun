import { getPostRevisions } from "../../../services/post-revisions";
import type { PostResolvers } from "./../../types.generated";

export const Post: PostResolvers = {
	revisions: (post) => getPostRevisions(post),
};
