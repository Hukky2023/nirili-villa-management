import {sqliteTable,text,integer} from "drizzle-orm/sqlite-core";
export const restaurantBills=sqliteTable("restaurant_bills",{key:text("key").primaryKey(),payload:text("payload").notNull(),revision:integer("revision").notNull(),updatedBy:text("updated_by").notNull()});

export const staffAccess=sqliteTable("staff_access",{email:text("email").primaryKey(),name:text("name").notNull(),grantedBy:text("granted_by").notNull()});
export const accounts=sqliteTable("accounts",{id:text("id").primaryKey(),username:text("username").notNull().unique(),email:text("email").unique(),name:text("name").notNull(),passwordHash:text("password_hash").notNull(),salt:text("salt").notNull(),role:text("role").notNull(),permissions:text("permissions").notNull().default("[]"),active:integer("active").notNull().default(1)});
export const accountSessions=sqliteTable("account_sessions",{tokenHash:text("token_hash").primaryKey(),accountId:text("account_id").notNull(),expiresAt:integer("expires_at").notNull()});
export const accountLimits=sqliteTable("account_limits",{key:text("key").primaryKey(),count:integer("count").notNull()});
export const operationRecords=sqliteTable("operation_records",{key:text("key").primaryKey(),payload:text("payload").notNull(),revision:integer("revision").notNull(),updatedBy:text("updated_by").notNull()});
