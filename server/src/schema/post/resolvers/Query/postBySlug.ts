import { getPostBySlug } from "../../../../services/posts";
import type { QueryResolvers } from "./../../../types.generated";

export const postBySlug: NonNullable<QueryResolvers['postBySlug']> = async (
	_parent,
	{ slug },
) => getPostBySlug(slug);
