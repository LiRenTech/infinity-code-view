use ignore::WalkBuilder;
use serde::Serialize;
use std::{fs, path::Path};

const MAX_CODE_BYTES: u64 = 2 * 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectEntry {
    pub id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub kind: &'static str,
    pub content: Option<String>,
    pub language: Option<String>,
    pub notice: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSnapshot {
    pub root_path: String,
    pub entries: Vec<ProjectEntry>,
    pub warnings: Vec<String>,
}

fn language(path: &Path) -> Option<&'static str> {
    let name = path.file_name()?.to_str()?;
    if matches!(
        name,
        "pnpm-lock.yaml" | "package-lock.json" | "npm-shrinkwrap.json" | "bun.lock"
    ) {
        return None;
    }
    if name == "Dockerfile" {
        return Some("dockerfile");
    }
    if matches!(name, "Makefile" | ".gitignore" | ".dockerignore" | ".env") {
        return Some("plaintext");
    }
    match path.extension()?.to_str()?.to_lowercase().as_str() {
        "ts" | "tsx" => Some("typescript"),
        "js" | "jsx" | "mjs" | "cjs" => Some("javascript"),
        "rs" => Some("rust"),
        "py" | "pyw" => Some("python"),
        "json" | "jsonc" => Some("json"),
        "css" | "scss" | "less" => Some("css"),
        "html" | "htm" | "xml" | "svg" | "vue" | "svelte" => Some("xml"),
        "md" | "mdx" => Some("markdown"),
        "toml" | "ini" => Some("ini"),
        "yaml" | "yml" => Some("yaml"),
        "sh" | "bash" | "zsh" => Some("bash"),
        "c" | "h" => Some("c"),
        "cpp" | "hpp" | "cc" => Some("cpp"),
        "go" => Some("go"),
        "java" => Some("java"),
        "kt" | "kts" => Some("kotlin"),
        "swift" => Some("swift"),
        "rb" => Some("ruby"),
        "php" => Some("php"),
        "sql" => Some("sql"),
        "cs" => Some("csharp"),
        "txt" | "lock" => None,
        _ => None,
    }
}

pub fn read_project(root: &Path) -> Result<ProjectSnapshot, String> {
    let root = root
        .canonicalize()
        .map_err(|e| format!("无法打开项目：{e}"))?;
    if !root.is_dir() {
        return Err("请选择文件夹".into());
    }
    let mut snapshot = ProjectSnapshot {
        root_path: root.to_string_lossy().into_owned(),
        entries: Vec::new(),
        warnings: Vec::new(),
    };
    let walker = WalkBuilder::new(&root)
        .hidden(false)
        .require_git(false)
        .git_global(false)
        .ignore(false)
        .follow_links(false)
        .filter_entry(|entry| entry.file_name() != ".git")
        .sort_by_file_path(|a, b| a.cmp(b))
        .build();
    for result in walker {
        let entry = match result {
            Ok(entry) => entry,
            Err(error) => {
                snapshot.warnings.push(error.to_string());
                continue;
            }
        };
        let path = entry.path();
        let relative = path.strip_prefix(&root).map_err(|e| e.to_string())?;
        let id = relative.to_string_lossy().replace('\\', "/");
        let is_dir = entry.file_type().is_some_and(|kind| kind.is_dir());
        let mut item = ProjectEntry {
            parent_id: if id.is_empty() {
                None
            } else {
                Some(
                    relative
                        .parent()
                        .unwrap_or(Path::new(""))
                        .to_string_lossy()
                        .replace('\\', "/"),
                )
            },
            id,
            name: path
                .file_name()
                .unwrap_or(root.as_os_str())
                .to_string_lossy()
                .into_owned(),
            kind: if is_dir { "folder" } else { "file" },
            content: None,
            language: language(path).map(String::from),
            notice: None,
        };
        if !is_dir && entry.file_type().is_some_and(|kind| kind.is_symlink()) {
            item.notice = Some("符号链接（不跟随）".into());
        } else if !is_dir && item.language.is_some() {
            match fs::metadata(path) {
                Ok(meta) if meta.len() > MAX_CODE_BYTES => {
                    item.notice = Some("超过 2 MiB，以文件卡片展示".into());
                }
                Ok(_) => match fs::read(path) {
                    Ok(bytes) if bytes.contains(&0) => item.notice = Some("二进制文件".into()),
                    Ok(bytes) => match String::from_utf8(bytes) {
                        Ok(content) => item.content = Some(content),
                        Err(_) => item.notice = Some("非 UTF-8 文本，以文件卡片展示".into()),
                    },
                    Err(error) => item.notice = Some(format!("读取失败：{error}")),
                },
                Err(error) => item.notice = Some(format!("读取失败：{error}")),
            }
        }
        snapshot.entries.push(item);
    }
    Ok(snapshot)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn respects_nested_gitignore_and_keeps_empty_and_hidden_folders() {
        let dir = std::env::temp_dir().join(format!("icv-scan-{}", std::process::id()));
        fs::create_dir_all(dir.join("src/empty")).unwrap();
        fs::create_dir_all(dir.join("build")).unwrap();
        fs::create_dir_all(dir.join(".git")).unwrap();
        fs::write(dir.join(".gitignore"), "build/\n*.tmp\n").unwrap();
        fs::write(dir.join("src/.gitignore"), "skip.ts\n!keep.tmp\n").unwrap();
        for name in [
            "src/a.ts",
            "src/skip.ts",
            "src/keep.tmp",
            "a.tmp",
            "build/a.ts",
            ".git/config",
            ".hidden",
        ] {
            fs::write(dir.join(name), "const x = 1;").unwrap();
        }
        let result = read_project(&dir).unwrap();
        let ids: Vec<_> = result
            .entries
            .iter()
            .map(|entry| entry.id.as_str())
            .collect();
        for id in [
            "",
            "src",
            "src/empty",
            "src/a.ts",
            "src/keep.tmp",
            ".hidden",
        ] {
            assert!(ids.contains(&id), "missing {id}");
        }
        for id in [".git", "build", "src/skip.ts", "a.tmp"] {
            assert!(!ids.contains(&id), "unexpected {id}");
        }
        assert_eq!(
            result
                .entries
                .iter()
                .find(|e| e.id == "src/a.ts")
                .unwrap()
                .content
                .as_deref(),
            Some("const x = 1;")
        );
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn compact_cards_for_binary_large_non_utf8_and_lock_files() {
        let dir = std::env::temp_dir().join(format!("icv-file-kinds-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("binary.ts"), [0, 1, 2]).unwrap();
        fs::write(dir.join("legacy.py"), [0xff, 0xfe]).unwrap();
        fs::write(
            dir.join("large.ts"),
            vec![b'x'; MAX_CODE_BYTES as usize + 1],
        )
        .unwrap();
        fs::write(dir.join("pnpm-lock.yaml"), "packages: {}").unwrap();
        fs::write(dir.join("Dockerfile"), "FROM node:22").unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(dir.join("Dockerfile"), dir.join("linked.ts")).unwrap();
        let result = read_project(&dir).unwrap();
        for id in ["binary.ts", "legacy.py", "large.ts", "pnpm-lock.yaml"] {
            assert!(
                result
                    .entries
                    .iter()
                    .find(|e| e.id == id)
                    .unwrap()
                    .content
                    .is_none()
            );
        }
        assert!(
            result
                .entries
                .iter()
                .find(|e| e.id == "Dockerfile")
                .unwrap()
                .content
                .is_some()
        );
        #[cfg(unix)]
        assert_eq!(
            result
                .entries
                .iter()
                .find(|e| e.id == "linked.ts")
                .unwrap()
                .notice
                .as_deref(),
            Some("符号链接（不跟随）")
        );
        fs::remove_dir_all(dir).unwrap();
    }
}
