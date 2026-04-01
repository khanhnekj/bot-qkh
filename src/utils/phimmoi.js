import axios from "axios";

const BASE_URL = "https://phimmoii.so";

/**
 * Clean Next.js push data strings
 */
function cleanNextData(str) {
    return str
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\")
        .replace(/\\n/g, "\n");
}

/**
 * Search movies on PhimMoi
 */
export async function search(keyword) {
    const url = `${BASE_URL}/search?q=${encodeURIComponent(keyword)}`;
    try {
        const { data } = await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        });

        const movies = [];
        // Regex to hunt for movie objects in the push segments
        // Format: \"id\":27708,\"name\":\"...\",\"slug\":\"...\"
        const movieRegex = /\\"id\\":(\d+),\\"name\\":\\"(.*?)\\",\\"origin_name\\":\\"(.*?)\\",\\"slug\\":\\"(.*?)\\"/g;
        let match;
        while ((match = movieRegex.exec(data)) !== null) {
            movies.push({
                id: match[1],
                name: match[2],
                origin_name: match[3],
                slug: match[4]
            });
        }

        // Filter out duplicates (often repeated in different segments)
        const seen = new Set();
        return movies.filter(m => {
            const isDup = seen.has(m.slug);
            seen.add(m.slug);
            return !isDup;
        });
    } catch (e) {
        console.error("PhimMoi Search Error:", e.message);
        throw e;
    }
}

/**
 * Get details from a PhimMoi movie page
 */
export async function getDetail(slug) {
    const url = `${BASE_URL}/phim/${slug}`;
    try {
        const { data } = await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        });

        // Search for the movie JSON object in segments
        const movieMatch = data.match(/\\"movie\\":\{(.*?)\}/);
        const episodeMatch = data.match(/\\"episodes\\":\[(.*?)\],\\"episodeVariants\\"/);
        
        let movieInfo = {};
        if (movieMatch) {
            const cleaned = cleanNextData("{" + movieMatch[1] + "}");
            try {
                movieInfo = JSON.parse(cleaned);
            } catch (e) {
                // FALLBACK: manual regex extraction if JSON fails
                const nameMatch = cleaned.match(/"name":"(.*?)"/);
                movieInfo.name = nameMatch ? nameMatch[1] : "Unknown";
            }
        }

        let episodes = [];
        if (episodeMatch) {
            const cleaned = cleanNextData("[" + episodeMatch[1] + "]");
            try {
                episodes = JSON.parse(cleaned);
            } catch (e) {}
        }

        return { movie: movieInfo, episodes: episodes };
    } catch (e) {
        console.error("PhimMoi Detail Error:", e.message);
        throw e;
    }
}

export default { search, getDetail };
