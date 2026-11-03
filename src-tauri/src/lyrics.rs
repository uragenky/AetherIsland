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
    pub fn parse_lrc(lrc_text: &str) -> Vec<LyricLine> {
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
                let total_time_ms = (min * 60 + sec) * 1000 + ms;
                let text = caps[4].trim().to_string();

                if !text.is_empty() {
                    lines.push(LyricLine {
                        time_ms: total_time_ms,
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
        let clean_title = Self::clean_title(raw_title);
        let clean_artist = raw_artist.trim().to_string();
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

        #[derive(Deserialize)]
        struct LrclibResponse {
            duration: Option<f64>,
            #[serde(rename = "syncedLyrics")]
            synced_lyrics: Option<String>,
            #[serde(rename = "plainLyrics")]
            plain_lyrics: Option<String>,
        }

        let resp = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Failed to reach lyrics service: {}", e))?;

        if !resp.status().is_success() {
            // Try fuzzy search if exact match fails
            let search_url = format!(
                "https://lrclib.net/api/search?q={}+{}",
                urlencoding::encode(&clean_title),
                urlencoding::encode(&clean_artist)
            );
            if let Ok(search_resp) = self.client.get(&search_url).send().await {
                if let Ok(results) = search_resp.json::<Vec<LrclibResponse>>().await {
                    if let Some(first) = results.into_iter().next() {
                        let parsed_lines = first
                            .synced_lyrics
                            .as_deref()
                            .map(Self::parse_lrc)
                            .unwrap_or_default();

                        let lyrics_data = LyricsData {
                            title: clean_title,
                            artist: clean_artist,
                            duration_ms: first.duration.map(|d| (d * 1000.0) as u64),
                            synced_lyrics: first.synced_lyrics,
                            plain_lyrics: first.plain_lyrics,
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
}
