use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LyricLine {
    pub time_ms: u64,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LyricsData {
    pub title: String,
    pub artist: String,
    pub duration_ms: Option<u64>,
    pub synced_lyrics: Option<String>,
    pub plain_lyrics: Option<String>,
    pub parsed_lines: Vec<LyricLine>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LyricsCandidate {
    pub id: u64,
    pub track_name: String,
    pub artist_name: String,
    pub album_name: Option<String>,
    pub duration: Option<f64>,
    pub instrumental: bool,
    pub has_synced: bool,
}

pub struct LyricsState {
    cache: Mutex<HashMap<String, LyricsData>>,
    client: reqwest::Client,
}

impl LyricsState {
    pub fn new() -> Self {
        Self {
            cache: Mutex::new(HashMap::new()),
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(5))
                .build()
                .unwrap_or_default(),
        }
    }

    /// Sanitizes video/track titles (removes "Official Music Video", "[HD]", "(feat. ...)", etc.)
    pub fn clean_title(raw_title: &str) -> String {
        let patterns = [
            r"(?i)\s*\[.*?\]",                         // [Official Video], [HD], etc.
            r"(?i)\s*\(.*?official.*?\)",              // (Official Music Video)
            r"(?i)\s*\(.*?video.*?\)",                 // (Music Video)
            r"(?i)\s*\(.*?audio.*?\)",                 // (Official Audio)
            r"(?i)\s*\(.*?lyric.*?\)",                 // (Lyric Video)
            r"(?i)\s*\(.*?remastered.*?\)",            // (2020 Remastered)
            r"(?i)\s*\(feat\..*?\)",                   // (feat. Artist)
            r"(?i)\s*\(ft\..*?\)",                     // (ft. Artist)
            r"(?i)\s*\|.*$",                           // Pipes | Channel name
            r"(?i)\s*-?\s*official\s*(music)?\s*video",// - Official Video
        ];

        let mut cleaned = raw_title.to_string();
        for pattern in patterns {
            if let Ok(re) = Regex::new(pattern) {
                cleaned = re.replace_all(&cleaned, "").to_string();
            }
        }
        cleaned.trim().to_string()
    }

    /// Parses standard LRC timestamp format: [mm:ss.xx] or [mm:ss.xxx] Line text
    /// Also respects [offset: +/-ms] tags for global timestamp compensation.
    pub fn parse_lrc(lrc_text: &str) -> Vec<LyricLine> {
        let offset_regex = Regex::new(r"(?i)\[offset:\s*([+-]?\d+)\]").ok();
        let mut offset_ms: i64 = 0;

        // Check for [offset: +/-ms] in header lines
        for line in lrc_text.lines() {
            if let Some(ref re) = offset_regex {
                if let Some(caps) = re.captures(line) {
                    if let Ok(val) = caps[1].parse::<i64>() {
                        offset_ms = val;
                        break;
                    }
                }
            }
        }

        let lrc_regex = match Regex::new(r"\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)") {
            Ok(re) => re,
            Err(_) => return Vec::new(),
        };

        let mut lines = Vec::new();
        for line in lrc_text.lines() {
            if let Some(caps) = lrc_regex.captures(line) {
                let min: u64 = caps[1].parse().unwrap_or(0);
                let sec: u64 = caps[2].parse().unwrap_or(0);
                let fraction_str = &caps[3];
                let ms: u64 = if fraction_str.len() == 2 {
                    fraction_str.parse::<u64>().unwrap_or(0) * 10
                } else {
                    fraction_str.parse().unwrap_or(0)
                };
                let raw_time_ms = (min * 60 + sec) * 1000 + ms;
                let text = caps[4].trim().to_string();

                if !text.is_empty() {
                    // Standard LRC: positive offset displays earlier, negative displays later
                    let adjusted_time_ms = if offset_ms >= 0 {
                        raw_time_ms.saturating_sub(offset_ms as u64)
                    } else {
                        raw_time_ms.saturating_add((-offset_ms) as u64)
                    };

                    lines.push(LyricLine {
                        time_ms: adjusted_time_ms,
                        text,
                    });
                }
            }
        }
        lines.sort_by_key(|l| l.time_ms);
        lines
    }

    pub async fn fetch_lyrics(
        &self,
        raw_title: &str,
        raw_artist: &str,
        duration_secs: Option<u64>,
    ) -> Result<LyricsData, String> {
        let mut clean_title = Self::clean_title(raw_title);
        let mut clean_artist = raw_artist.trim().to_string();

        let is_generic_artist = clean_artist.is_empty()
            || clean_artist.eq_ignore_ascii_case("youtube")
            || clean_artist.eq_ignore_ascii_case("google chrome")
            || clean_artist.eq_ignore_ascii_case("msedge")
            || clean_artist.eq_ignore_ascii_case("microsoft edge")
            || clean_artist.eq_ignore_ascii_case("firefox")
            || clean_artist.eq_ignore_ascii_case("opera")
            || clean_artist.eq_ignore_ascii_case("brave");

        if is_generic_artist && clean_title.contains(" - ") {
            let parts: Vec<&str> = clean_title.splitn(2, " - ").collect();
            if parts.len() == 2 && !parts[0].trim().is_empty() && !parts[1].trim().is_empty() {
                clean_artist = parts[0].trim().to_string();
                clean_title = parts[1].trim().to_string();
            }
        }

        let cache_key = format!("{}::{}", clean_artist.to_lowercase(), clean_title.to_lowercase());

        {
            let cache = self.cache.lock().unwrap();
            if let Some(cached) = cache.get(&cache_key) {
                return Ok(cached.clone());
            }
        }

        // Query LRCLIB API
        let mut url = format!(
            "https://lrclib.net/api/get?track_name={}&artist_name={}",
            urlencoding::encode(&clean_title),
            urlencoding::encode(&clean_artist)
        );
        if let Some(dur) = duration_secs {
            url.push_str(&format!("&duration={}", dur));
        }

        #[derive(Deserialize, Clone)]
        struct LrclibResponse {
            duration: Option<f64>,
            #[serde(rename = "syncedLyrics")]
            synced_lyrics: Option<String>,
            #[serde(rename = "plainLyrics")]
            plain_lyrics: Option<String>,
        }

        let mut resp = self.client.get(&url).send().await;

        // If exact query with duration failed (e.g. 404 because track duration slightly deviates from LRCLIB entry),
        // retry /api/get WITHOUT &duration before falling back to fuzzy search.
        if duration_secs.is_some() && (resp.is_err() || !resp.as_ref().unwrap().status().is_success()) {
            let fallback_url = format!(
                "https://lrclib.net/api/get?track_name={}&artist_name={}",
                urlencoding::encode(&clean_title),
                urlencoding::encode(&clean_artist)
            );
            if let Ok(retry_resp) = self.client.get(&fallback_url).send().await {
                if retry_resp.status().is_success() {
                    resp = Ok(retry_resp);
                }
            }
        }

        let resp = resp.map_err(|e| format!("Failed to reach lyrics service: {}", e))?;

        if !resp.status().is_success() {
            // Try fuzzy search if exact match fails
            let search_url = format!(
                "https://lrclib.net/api/search?q={}+{}",
                urlencoding::encode(&clean_title),
                urlencoding::encode(&clean_artist)
            );
            if let Ok(search_resp) = self.client.get(&search_url).send().await {
                if let Ok(results) = search_resp.json::<Vec<LrclibResponse>>().await {
                    let has_synced = |r: &LrclibResponse| {
                        r.synced_lyrics
                            .as_ref()
                            .map(|s| !s.trim().is_empty())
                            .unwrap_or(false)
                    };

                    let chosen = if let Some(target_dur) = duration_secs {
                        let target_f = target_dur as f64;
                        // Smart duration matching:
                        // 1. Synced lyrics prioritize over plain lyrics
                        // 2. Minimum absolute difference to target duration
                        results.into_iter().min_by(|a, b| {
                            let a_synced = has_synced(a);
                            let b_synced = has_synced(b);
                            if a_synced != b_synced {
                                return b_synced.cmp(&a_synced);
                            }
                            let diff_a = a.duration.map(|d| (d - target_f).abs()).unwrap_or(9999.0);
                            let diff_b = b.duration.map(|d| (d - target_f).abs()).unwrap_or(9999.0);
                            diff_a.partial_cmp(&diff_b).unwrap_or(std::cmp::Ordering::Equal)
                        })
                    } else {
                        results
                            .iter()
                            .find(|r| has_synced(r))
                            .cloned()
                            .or_else(|| results.into_iter().next())
                    };

                    if let Some(candidate) = chosen {
                        let parsed_lines = candidate
                            .synced_lyrics
                            .as_deref()
                            .map(Self::parse_lrc)
                            .unwrap_or_default();

                        let lyrics_data = LyricsData {
                            title: clean_title,
                            artist: clean_artist,
                            duration_ms: candidate.duration.map(|d| (d * 1000.0) as u64),
                            synced_lyrics: candidate.synced_lyrics,
                            plain_lyrics: candidate.plain_lyrics,
                            parsed_lines,
                        };

                        let mut cache = self.cache.lock().unwrap();
                        cache.insert(cache_key, lyrics_data.clone());
                        return Ok(lyrics_data);
                    }
                }
            }
            return Err("Lyrics not found".to_string());
        }

        let data: LrclibResponse = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse lyrics json: {}", e))?;

        let parsed_lines = data
            .synced_lyrics
            .as_deref()
            .map(Self::parse_lrc)
            .unwrap_or_default();

        let lyrics_data = LyricsData {
            title: clean_title,
            artist: clean_artist,
            duration_ms: data.duration.map(|d| (d * 1000.0) as u64),
            synced_lyrics: data.synced_lyrics,
            plain_lyrics: data.plain_lyrics,
            parsed_lines,
        };

        let mut cache = self.cache.lock().unwrap();
        cache.insert(cache_key, lyrics_data.clone());
        Ok(lyrics_data)
    }

    pub async fn search_candidates(
        &self,
        raw_title: &str,
        raw_artist: &str,
    ) -> Result<Vec<LyricsCandidate>, String> {
        let mut clean_title = Self::clean_title(raw_title);
        let mut clean_artist = raw_artist.trim().to_string();

        let is_generic_artist = clean_artist.is_empty()
            || clean_artist.eq_ignore_ascii_case("youtube")
            || clean_artist.eq_ignore_ascii_case("google chrome")
            || clean_artist.eq_ignore_ascii_case("msedge")
            || clean_artist.eq_ignore_ascii_case("microsoft edge")
            || clean_artist.eq_ignore_ascii_case("firefox")
            || clean_artist.eq_ignore_ascii_case("opera")
            || clean_artist.eq_ignore_ascii_case("brave");

        if is_generic_artist && clean_title.contains(" - ") {
            let parts: Vec<&str> = clean_title.splitn(2, " - ").collect();
            if parts.len() == 2 && !parts[0].trim().is_empty() && !parts[1].trim().is_empty() {
                clean_artist = parts[0].trim().to_string();
                clean_title = parts[1].trim().to_string();
            }
        }

        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct RawItem {
            id: u64,
            track_name: Option<String>,
            name: Option<String>,
            artist_name: Option<String>,
            album_name: Option<String>,
            duration: Option<f64>,
            #[serde(default)]
            instrumental: bool,
            synced_lyrics: Option<String>,
        }

        // 1. Try structured search with track_name and artist_name
        let url_structured = format!(
            "https://lrclib.net/api/search?track_name={}&artist_name={}",
            urlencoding::encode(&clean_title),
            urlencoding::encode(&clean_artist)
        );

        let mut results: Vec<RawItem> = Vec::new();
        if let Ok(resp) = self.client.get(&url_structured).send().await {
            if let Ok(items) = resp.json::<Vec<RawItem>>().await {
                results = items;
            }
        }

        // 2. Fallback to freeform search query if structured returned 0 results
        if results.is_empty() {
            let query = if clean_artist.is_empty() {
                clean_title.clone()
            } else {
                format!("{} {}", clean_title, clean_artist)
            };
            let url_q = format!(
                "https://lrclib.net/api/search?q={}",
                urlencoding::encode(&query)
            );
            if let Ok(resp) = self.client.get(&url_q).send().await {
                if let Ok(items) = resp.json::<Vec<RawItem>>().await {
                    results = items;
                }
            }
        }

        let candidates = results
            .into_iter()
            .map(|item| {
                let has_synced = item
                    .synced_lyrics
                    .as_ref()
                    .map(|s| !s.trim().is_empty())
                    .unwrap_or(false);
                LyricsCandidate {
                    id: item.id,
                    track_name: item.track_name.or(item.name).unwrap_or_else(|| clean_title.clone()),
                    artist_name: item.artist_name.unwrap_or_else(|| clean_artist.to_string()),
                    album_name: item.album_name,
                    duration: item.duration,
                    instrumental: item.instrumental,
                    has_synced,
                }
            })
            .collect();

        Ok(candidates)
    }

    pub async fn fetch_by_id(
        &self,
        id: u64,
        raw_title: Option<String>,
        raw_artist: Option<String>,
    ) -> Result<LyricsData, String> {
        let url = format!("https://lrclib.net/api/get/{}", id);

        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct RawLrclibGet {
            track_name: Option<String>,
            name: Option<String>,
            artist_name: Option<String>,
            duration: Option<f64>,
            synced_lyrics: Option<String>,
            plain_lyrics: Option<String>,
        }

        let resp = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch lyric ID {}: {}", id, e))?;

        if !resp.status().is_success() {
            return Err(format!("LRCLIB returned status {}", resp.status()));
        }

        let data: RawLrclibGet = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse lyric JSON: {}", e))?;

        let title = data
            .track_name
            .or(data.name)
            .unwrap_or_else(|| raw_title.unwrap_or_default());
        let artist = data
            .artist_name
            .unwrap_or_else(|| raw_artist.unwrap_or_default());
        let parsed_lines = data
            .synced_lyrics
            .as_deref()
            .map(Self::parse_lrc)
            .unwrap_or_default();

        let lyrics_data = LyricsData {
            title: title.clone(),
            artist: artist.clone(),
            duration_ms: data.duration.map(|d| (d * 1000.0) as u64),
            synced_lyrics: data.synced_lyrics,
            plain_lyrics: data.plain_lyrics,
            parsed_lines,
        };

        let cache_key = format!("{}::{}", artist.trim().to_lowercase(), title.trim().to_lowercase());
        let mut cache = self.cache.lock().unwrap();
        cache.insert(cache_key, lyrics_data.clone());

        Ok(lyrics_data)
    }
}

mod urlencoding {
    pub fn encode(s: &str) -> String {
        let mut encoded = String::new();
        for byte in s.bytes() {
            match byte {
                b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                    encoded.push(byte as char);
                }
                b' ' => encoded.push('+'),
                _ => {
                    encoded.push_str(&format!("%{:02X}", byte));
                }
            }
        }
        encoded
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clean_title() {
        assert_eq!(
            LyricsState::clean_title("Blinding Lights (Official Music Video) [4K]"),
            "Blinding Lights"
        );
        assert_eq!(
            LyricsState::clean_title("Starboy (feat. Daft Punk) [HD]"),
            "Starboy"
        );
        assert_eq!(
            LyricsState::clean_title("Numb (Official Lyric Video)"),
            "Numb"
        );
    }

    #[test]
    fn test_parse_lrc() {
        let sample = "[00:12.50]Line 1\n[01:05.100]Line 2\nInvalid Line";
        let parsed = LyricsState::parse_lrc(sample);
        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0].time_ms, 12500);
        assert_eq!(parsed[0].text, "Line 1");
        assert_eq!(parsed[1].time_ms, 65100);
        assert_eq!(parsed[1].text, "Line 2");
    }

    #[test]
    fn test_parse_lrc_with_offset() {
        // Positive offset moves time earlier (subtracts ms)
        let sample_pos = "[offset: 500]\n[00:10.00]Line 1";
        let parsed_pos = LyricsState::parse_lrc(sample_pos);
        assert_eq!(parsed_pos.len(), 1);
        assert_eq!(parsed_pos[0].time_ms, 9500);

        // Negative offset moves time later (adds ms)
        let sample_neg = "[offset:-300]\n[00:10.00]Line 1";
        let parsed_neg = LyricsState::parse_lrc(sample_neg);
        assert_eq!(parsed_neg.len(), 1);
        assert_eq!(parsed_neg[0].time_ms, 10300);
    }

    #[test]
    fn test_lrclib_json_deserialization() {
        let json_data = r#"[
            {
                "id": 12345,
                "name": "Hello",
                "trackName": "Hello",
                "artistName": "Adele",
                "albumName": "25",
                "duration": 296.0,
                "instrumental": false,
                "syncedLyrics": "[00:10.00]Hello"
            }
        ]"#;

        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct RawItemTest {
            id: u64,
            track_name: Option<String>,
            name: Option<String>,
            artist_name: Option<String>,
            album_name: Option<String>,
            duration: Option<f64>,
            #[serde(default)]
            instrumental: bool,
            synced_lyrics: Option<String>,
        }

        let items: Vec<RawItemTest> = serde_json::from_str(json_data).expect("deserialization failed");
        let first = items.into_iter().next().expect("item missing");
        assert_eq!(first.id, 12345);
        assert_eq!(first.track_name.or(first.name).as_deref(), Some("Hello"));
        assert_eq!(first.artist_name.as_deref(), Some("Adele"));
        assert_eq!(first.album_name.as_deref(), Some("25"));
        assert_eq!(first.duration, Some(296.0));
        assert!(!first.instrumental);
        assert_eq!(first.synced_lyrics.as_deref(), Some("[00:10.00]Hello"));
    }
}
