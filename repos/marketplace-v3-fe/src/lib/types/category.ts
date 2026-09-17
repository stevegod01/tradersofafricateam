export type Category = {
  id: string;
  category: string;
  image: string | null;
  icon: string | null;
  createdAt: string;
  updatedAt: string;
  description: string | null;
  parentId: string | null;
  slug: string | null;
  parent?: Category | null;
  children: Category[];
};
