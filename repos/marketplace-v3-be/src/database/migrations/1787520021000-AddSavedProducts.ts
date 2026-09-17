import { MigrationInterface, QueryRunner } from 'typeorm';
export class AddSavedProducts1787520021000 implements MigrationInterface {
    name = 'AddSavedProducts1787520021000';
    async up(q: QueryRunner): Promise<void> {
        await q.query(`CREATE TABLE saved_products (
      id VARCHAR(36) NOT NULL PRIMARY KEY, userId VARCHAR(36) NOT NULL, productId VARCHAR(36) NOT NULL,
      createdAt TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      UNIQUE KEY UQ_saved_products_user_product(userId,productId),
      KEY IDX_saved_products_owner_created(userId,createdAt,id), KEY IDX_saved_products_product(productId),
      CONSTRAINT FK_saved_products_user FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT FK_saved_products_product FOREIGN KEY(productId) REFERENCES products(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    }
    async down(q: QueryRunner): Promise<void> { await q.query('DROP TABLE saved_products'); }
}
