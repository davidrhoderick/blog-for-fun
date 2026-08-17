import { migrate } from 'drizzle-orm/libsql/migrator';
import { db } from './index';

await migrate(db, { migrationsFolder: './migrations' });
