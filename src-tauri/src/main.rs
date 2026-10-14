#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::{engine::general_purpose::STANDARD, Engine as _};
#[cfg(windows)]
use keyring::Entry;
use reqwest::{header, Client};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{sync::OnceLock, time::Duration};

static HTTP_CLIENT: OnceLock<Result<Client, String>> = OnceLock::new();
const CREDENTIAL_SERVICE: &str = "com.maximo.sqlconsole";
const CREDENTIAL_ACCOUNT: &str = "maximo-connection";

#[cfg(windows)]
fn credential_entry() -> Result<Entry, String> {
    Entry::new(CREDENTIAL_SERVICE, CREDENTIAL_ACCOUNT).map_err(|e| e.to_string())
}

#[cfg(not(windows))]
fn credential_entry() -> Result<(), String> {
    Err("Lưu mật khẩu an toàn hiện chỉ hỗ trợ Windows Credential Manager.".into())
}

fn load_password() -> Result<String, String> {
    #[cfg(windows)]
    {
        return credential_entry()?
            .get_password()
            .map_err(|_| "Chưa có mật khẩu Maximo trong Windows Credential Manager. Hãy mở Cấu hình kết nối và lưu lại mật khẩu.".to_string());
    }
    #[cfg(not(windows))]
    {
        credential_entry()?;
        unreachable!()
    }
}

fn http_client() -> Result<&'static Client, String> {
    HTTP_CLIENT
        .get_or_init(|| {
            Client::builder()
                .timeout(Duration::from_secs(60))
                .build()
                .map_err(|e| e.to_string())
        })
        .as_ref()
        .map_err(Clone::clone)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConnectionConfig {
    host: String,
    context: String,
    username: String,
}

#[tauri::command]
fn save_connection_password(password: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        if password.is_empty() {
            return Err("Mật khẩu không được để trống.".into());
        }
        return credential_entry()?.set_password(&password).map_err(|e| e.to_string());
    }
    #[cfg(not(windows))]
    {
        let _ = password;
        credential_entry()?;
        unreachable!()
    }
}

#[tauri::command]
fn has_connection_password() -> Result<bool, String> {
    #[cfg(windows)]
    {
        return match credential_entry()?.get_password() {
            Ok(_) => Ok(true),
            Err(keyring::Error::NoEntry) => Ok(false),
            Err(error) => Err(error.to_string()),
        };
    }
    #[cfg(not(windows))]
    {
        credential_entry()?;
        unreachable!()
    }
}

#[tauri::command]
fn delete_connection_password() -> Result<(), String> {
    #[cfg(windows)]
    {
        return match credential_entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(error.to_string()),
        };
    }
    #[cfg(not(windows))]
    {
        credential_entry()?;
        unreachable!()
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct QueryResult {
    action: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    page: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    page_size: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    has_more: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<Vec<Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

fn endpoint(config: &ConnectionConfig) -> Result<String, String> {
    let host = config.host.trim().trim_end_matches('/');
    if !(host.starts_with("https://") || host.starts_with("http://")) {
        return Err("Host phải bắt đầu bằng http:// hoặc https://".into());
    }
    if config.username.trim().is_empty() {
        return Err("Thiếu username Maximo.".into());
    }
    let context = config.context.trim().trim_matches('/');
    let context = if context.is_empty() { "maximo" } else { context };
    Ok(format!("{host}/{context}/oslc/script/EXEC_SQL"))
}

async fn post_sql(config: &ConnectionConfig, sql: &str) -> Result<Value, String> {
    let url = endpoint(config)?;
    let password = load_password()?;
    let auth = STANDARD.encode(format!("{}:{password}", config.username));
    let response = http_client()?
        .post(url)
        .header(header::CONTENT_TYPE, "text/plain")
        .header("MAXAUTH", auth)
        .body(sql.to_owned())
        .send()
        .await
        .map_err(|e| format!("Không thể kết nối Maximo: {e}"))?;
    let status = response.status();
    let body = response.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("Maximo trả về HTTP {}: {}", status.as_u16(), body));
    }
    serde_json::from_str(&body).map_err(|e| format!("Phản hồi Maximo không phải JSON hợp lệ: {e}"))
}

#[tauri::command]
async fn get_schema(config: ConnectionConfig) -> Result<Value, String> {
    let sql = "SELECT LOWER(objectname) AS tablename, LOWER(attributename) AS colname FROM maxattribute WHERE persistent = 1 ORDER BY objectname, attributename";
    let result = post_sql(&config, sql).await?;
    if result["success"] != true {
        return Err(result["error"].as_str().unwrap_or("Không thể tải schema.").into());
    }
    let rows = result["data"].as_array().ok_or("Dữ liệu schema không hợp lệ.")?;
    let mut schema = serde_json::Map::new();
    for row in rows {
        if let (Some(table), Some(column)) = (row["tablename"].as_str(), row["colname"].as_str()) {
            let columns = schema.entry(table.to_owned()).or_insert_with(|| json!([]));
            if let Some(list) = columns.as_array_mut() {
                list.push(json!(column));
            }
        }
    }
    Ok(json!({"success": true, "schema": schema}))
}

#[tauri::command]
async fn execute_sql(
    config: ConnectionConfig,
    sql: String,
    page: Option<u32>,
    safe_mode: Option<bool>,
) -> Result<QueryResult, String> {
    let clean = sql.trim().trim_end_matches(';').trim();
    if clean.is_empty() {
        return Err("Câu lệnh SQL không được để trống.".into());
    }
    let upper = clean.to_ascii_uppercase();
    let is_select = upper.starts_with("SELECT") || upper.starts_with("WITH");
    if safe_mode.unwrap_or(false)
        && !is_select
        && upper != "COMMIT"
        && upper != "ROLLBACK"
    {
        return Err("Chế độ Safe Mode đang bật. Không thể thực thi câu lệnh thay đổi dữ liệu.".into());
    }

    let page_size = 50usize;
    let current_page = page.unwrap_or(1).max(1);
    let statement = if is_select {
        let start = (current_page as usize - 1) * page_size + 1;
        let end = current_page as usize * page_size + 1;
        format!("SELECT * FROM (SELECT src_tbl.*, ROWNUM AS oracle_rn FROM ({clean}) src_tbl WHERE ROWNUM <= {end}) WHERE oracle_rn >= {start}")
    } else {
        clean.to_owned()
    };
    let result = post_sql(&config, &statement).await?;
    if result["success"] != true {
        return Err(result["error"].as_str().unwrap_or("Maximo không thực thi được câu lệnh.").into());
    }

    if result["action"] == "SELECT" {
        let mut rows = result["data"].as_array().cloned().unwrap_or_default();
        for row in &mut rows {
            if let Some(object) = row.as_object_mut() {
                object.remove("oracle_rn");
                object.remove("ORACLE_RN");
            }
        }
        let has_more = rows.len() > page_size;
        if has_more { rows.pop(); }
        Ok(QueryResult {
            action: "SELECT".into(), page: Some(current_page), page_size: Some(page_size),
            has_more: Some(has_more), data: Some(rows), message: None,
        })
    } else {
        Ok(QueryResult {
            action: "EXECUTE".into(), page: None, page_size: None, has_more: None,
            data: None, message: result["message"].as_str().map(str::to_owned),
        })
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            get_schema,
            execute_sql,
            save_connection_password,
            has_connection_password,
            delete_connection_password
        ])
        .run(tauri::generate_context!())
        .expect("Không thể khởi chạy Maximo SQL Query Console");
}
