use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::path::Path;

pub struct Db(pub Connection);

impl Db {
    pub fn open(path: &Path) -> Result<Self, String> {
        let conn = Connection::open(path).map_err(|e| e.to_string())?;
        conn.execute_batch(
            "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;",
        )
        .map_err(|e| e.to_string())?;
        Ok(Self(conn))
    }

    pub fn list_products(&self, page: i64, page_size: i64) -> Result<Value, String> {
        let offset = (page - 1).max(0) * page_size;
        let total: i64 = self
            .0
            .query_row("SELECT COUNT(*) FROM Product", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        let mut stmt = self
            .0
            .prepare(
                "SELECT id, platform, itemId, title, picUrl, detailUrls, createdAt FROM Product ORDER BY createdAt DESC LIMIT ?1 OFFSET ?2",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![page_size, offset], |row| {
                Ok(json!({
                    "id": row.get::<_, String>(0)?,
                    "platform": row.get::<_, String>(1)?,
                    "itemId": row.get::<_, Option<String>>(2)?,
                    "title": row.get::<_, Option<String>>(3)?,
                    "picUrl": row.get::<_, Option<String>>(4)?,
                    "detailUrls": row.get::<_, Option<String>>(5)?,
                    "createdAt": row.get::<_, String>(6)?,
                }))
            })
            .map_err(|e| e.to_string())?;
        let mut products = Vec::new();
        for r in rows {
            products.push(r.map_err(|e| e.to_string())?);
        }
        Ok(json!({ "success": true, "page": page, "pageSize": page_size, "total": total, "products": products }))
    }

    pub fn list_tasks(&self, page: i64, page_size: i64) -> Result<Value, String> {
        let offset = (page - 1).max(0) * page_size;
        let total: i64 = self
            .0
            .query_row("SELECT COUNT(*) FROM ImageTask", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        let mut stmt = self
            .0
            .prepare(
                "SELECT id, productId, prompt, taskId, status, resultUrl, failReason, model, mediaType, size, quality, createdAt, updatedAt FROM ImageTask ORDER BY createdAt DESC LIMIT ?1 OFFSET ?2",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![page_size, offset], |row| {
                Ok(json!({
                    "id": row.get::<_, String>(0)?,
                    "productId": row.get::<_, Option<String>>(1)?,
                    "prompt": row.get::<_, String>(2)?,
                    "taskId": row.get::<_, Option<String>>(3)?,
                    "status": row.get::<_, String>(4)?,
                    "resultUrl": row.get::<_, Option<String>>(5)?,
                    "failReason": row.get::<_, Option<String>>(6)?,
                    "model": row.get::<_, Option<String>>(7)?,
                    "mediaType": row.get::<_, Option<String>>(8)?,
                    "size": row.get::<_, Option<String>>(9)?,
                    "quality": row.get::<_, Option<String>>(10)?,
                    "createdAt": row.get::<_, String>(11)?,
                    "updatedAt": row.get::<_, String>(12)?,
                }))
            })
            .map_err(|e| e.to_string())?;
        let mut tasks = Vec::new();
        for r in rows {
            tasks.push(r.map_err(|e| e.to_string())?);
        }
        Ok(json!({ "success": true, "page": page, "pageSize": page_size, "total": total, "tasks": tasks }))
    }

    pub fn list_prompts(&self) -> Result<Value, String> {
        let mut stmt = self
            .0
            .prepare(
                "SELECT id, productId, productTitle, productFingerprint, modelUsed, styleName, promptsJson, createdAt FROM PromptRecord ORDER BY createdAt DESC LIMIT 200",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(json!({
                    "id": row.get::<_, String>(0)?,
                    "productId": row.get::<_, Option<String>>(1)?,
                    "productTitle": row.get::<_, Option<String>>(2)?,
                    "productFingerprint": row.get::<_, Option<String>>(3)?,
                    "modelUsed": row.get::<_, Option<String>>(4)?,
                    "styleName": row.get::<_, Option<String>>(5)?,
                    "promptsJson": row.get::<_, String>(6)?,
                    "createdAt": row.get::<_, String>(7)?,
                }))
            })
            .map_err(|e| e.to_string())?;
        let mut records = Vec::new();
        for r in rows {
            records.push(r.map_err(|e| e.to_string())?);
        }
        Ok(json!({ "success": true, "records": records }))
    }

    pub fn list_styles(&self) -> Result<Value, String> {
        let mut stmt = self
            .0
            .prepare(
                "SELECT id, name, category, tag, desc, promptSnippet, coverUrl, sampleImages, sourceUrl, isFavorite, createdAt, updatedAt FROM StyleRecipe ORDER BY createdAt DESC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(json!({
                    "id": row.get::<_, String>(0)?,
                    "name": row.get::<_, String>(1)?,
                    "category": row.get::<_, String>(2)?,
                    "tag": row.get::<_, Option<String>>(3)?,
                    "desc": row.get::<_, Option<String>>(4)?,
                    "promptSnippet": row.get::<_, String>(5)?,
                    "coverUrl": row.get::<_, Option<String>>(6)?,
                    "sampleImages": row.get::<_, Option<String>>(7)?,
                    "sourceUrl": row.get::<_, Option<String>>(8)?,
                    "isFavorite": row.get::<_, i64>(9)? != 0,
                    "createdAt": row.get::<_, String>(10)?,
                    "updatedAt": row.get::<_, String>(11)?,
                }))
            })
            .map_err(|e| e.to_string())?;
        let mut styles = Vec::new();
        for r in rows {
            styles.push(r.map_err(|e| e.to_string())?);
        }
        Ok(json!({ "success": true, "styles": styles }))
    }
}
