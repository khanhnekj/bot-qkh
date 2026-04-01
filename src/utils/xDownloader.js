import axios from "axios";

// ================= CONSTANTS & CONFIG =================

const cookie = 'guest_id=v1%3A173434971745192249; night_mode=2; guest_id_marketing=v1%3A173434971745192249; guest_id_ads=v1%3A173434971745192249; gt=1881686257304244308; kdt=d8grHpSIoLAVc774CMmfx9gJYwh2xVdm0p2iBSM1; auth_token=81784df936aaab87a882ae2ef823dd3b680e033a; ct0=bc71e4f240a3ad0f5039e02606ff361666bd8e709ec5e0dfd161fbdf001212d4daf4aa4f162e8fa58a5c50d00a43b2dff7e99fa996a8247b9c847ed32c394168b65b2ccf98dfc3a8f01f33ee548621c1; att=1-kCWRcayScBALVtjFMRmmmoZ4C2UTgKEeFE8488bi; lang=en; twid=u%3D1881426828977741824; personalization_id="v1_8xw99mWnUMTJBzni6H3jWQ=="';
const token = 'bc71e4f240a3ad0f5039e02606ff361666bd8e709ec5e0dfd161fbdf001212d4daf4aa4f162e8fa58a5c50d00a43b2dff7e99fa996a8247b9c847ed32c394168b65b2ccf98dfc3a8f01f33ee548621c1';
const CONFIG = {
  cookie: '__cuid=fea7002e97994a48aade41cf171ef135; kdt=o91SKbkebIEJs99JMLQZCcK6rGlIc1B4YrADWVQm; dnt=1; guest_id=v1%3A176249836234290884; guest_id_marketing=v1%3A176249836234290884; guest_id_ads=v1%3A176249836234290884; personalization_id="v1_+kfo3TnjCdOgWAy2ALS3Gw=="; g_state={"i_l":0,"i_ll":1762498365506}; auth_token=48caad9462273122afdbbe0fffa984a702884bca; ct0=1522d1dd7fb69df0e07046c2ad1e99f6c29a278a9d0895dfbcd9bba1f96676e5a4f3d57100a62f02c2f17a48ada6dfcf15a930a937ed96f0d7c050d00af7e143028cdb42d1b6ce44ca2e3e27b5ec912e; twid=u%3D1720437524911579136; lang=en; external_referer=padhuUp37zjSzNXpb3CVCQ%3D%3D|0|8e8t2xd8A2w%3D; __cf_bm=mjXwRy.1SM0cTTJI6M47aG1nxSJCPeiAOrFuxfQtL_s-1764042804.8761914-1.0.1.1-xW5ZOWOu8ktV1g3ju26wnX3ewQcFfUA9sjypYA9iQcZUi3WKh0kToVaS6OVFN_8wdKEGCqHKZM79LOKIp7Z5wdZumWwGdh26.UoGiyzMAtKigSPKe9Wc4hBlG2jmCkn5',
  csrfToken: '1522d1dd7fb69df0e07046c2ad1e99f6c29a278a9d0895dfbcd9bba1f96676e5a4f3d57100a62f02c2f17a48ada6dfcf15a930a937ed96f0d7c050d00af7e143028cdb42d1b6ce44ca2e3e27b5ec912e',
  transactionId: '37xAP0jLEBaM4P+kOznB2Qv+Y6gWYXNd7yc9MFyHsdfIorAhYhlwZ/lOkapafMPZDkAbCtt+AJT5r9h0cECdCrNGpHC83A'
};

const TWEET_FEATURES = {
  "rweb_video_screen_enabled": false, "profile_label_improvements_pcf_label_in_post_enabled": true, "responsive_web_profile_redirect_enabled": false,
  "rweb_tipjar_consumption_enabled": true, "verified_phone_label_enabled": false, "creator_subscriptions_tweet_preview_api_enabled": true,
  "responsive_web_graphql_timeline_navigation_enabled": true, "responsive_web_graphql_skip_user_profile_image_extensions_enabled": false,
  "premium_content_api_read_enabled": false, "communities_web_enable_tweet_community_results_fetch": true, "c9s_tweet_anatomy_moderator_badge_enabled": true,
  "responsive_web_grok_analyze_button_fetch_trends_enabled": false, "responsive_web_grok_analyze_post_followups_enabled": true, "responsive_web_jetfuel_frame": true,
  "responsive_web_grok_share_attachment_enabled": true, "articles_preview_enabled": true, "responsive_web_edit_tweet_api_enabled": true,
  "graphql_is_translatable_rweb_tweet_is_translatable_enabled": true, "view_counts_everywhere_api_enabled": true, "longform_notetweets_consumption_enabled": true,
  "responsive_web_twitter_article_tweet_consumption_enabled": true, "tweet_awards_web_tipping_enabled": false, "responsive_web_grok_show_grok_translated_post": false,
  "responsive_web_grok_analysis_button_from_backend": true, "creator_subscriptions_quote_tweet_preview_enabled": false, "freedom_of_speech_not_reach_fetch_enabled": true,
  "standardized_nudges_misinfo": true, "tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled": true, "longform_notetweets_rich_text_read_enabled": true,
  "longform_notetweets_inline_media_enabled": true, "responsive_web_grok_image_annotation_enabled": true, "responsive_web_grok_imagine_annotation_enabled": true,
  "responsive_web_grok_community_note_auto_translation_is_enabled": false, "responsive_web_enhance_cards_enabled": false
};

// ================= UTILS =================

function cleanGarbage(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(item => cleanGarbage(item));
  const newObj = {};
  for (const key in obj) {
    if (['sizes', 'features', 'original_info', 'focus_rects'].includes(key)) continue;
    newObj[key] = cleanGarbage(obj[key]);
  }
  return newObj;
}

export async function downloadv1(url) {
    try {
        let input = { url: typeof url === 'object' ? url.url : url };
        if (!input.url) return { found: false, error: 'Không có URL' };
        if (/twitter\.com|x\.com/.test(input.url)) {
            const apiURL = input.url.replace(/twitter\.com|x\.com/g, 'api.fxtwitter.com');
            const result = await axios.get(apiURL).then(res => res.data).catch(() => {
                throw new Error('Liên kết Twitter không hợp lệ');
            });
            if (result && result.code === 200 && result.tweet) {
                const tweet = result.tweet;
                const media = [];
                let type = "text";
                if (tweet.media) {
                    if (tweet.media.videos && tweet.media.videos.length > 0) {
                        type = "video";
                        media.push(...tweet.media.videos.map(v => v.url));
                    }
                    if (tweet.media.photos && tweet.media.photos.length > 0) {
                        if (type === "text") type = "photo";
                        media.push(...tweet.media.photos.map(p => p.url));
                    }
                }
                if (media.length === 0) return { found: false, error: 'Không tìm thấy phương tiện' };
                return {
                    type: type,
                    media: media, // array of strings
                    title: tweet.text || 'Không có tiêu đề',
                    id: tweet.id,
                    date: tweet.created_at || tweet.date,
                    likes: tweet.likes || 0,
                    replies: tweet.replies || 0,
                    retweets: tweet.retweets || 0,
                    author: tweet.author?.name || 'Unknown',
                    username: tweet.author?.screen_name || 'unknown'
                };
            } else {
                return { found: false, error: 'API không trả về dữ liệu hợp lệ' };
            }
        } else {
            return { found: false, error: `URL không hợp lệ` };
        }
    } catch (error) { return { found: false, error: error.message }; }
}

export async function downloadv2(url) {
    const isValidUrl = (url) => /https?:\/\/(www\.)?(x\.com|twitter\.com)\/\w+\/status\/\d+/i.test(url);
    if (!isValidUrl(url)) return Promise.reject(new Error("Invalid URL"));
    const idMatch = url.match(/\/(\d+)/);
    if (!idMatch) return Promise.reject(new Error("Error getting ID"));
    const tweetId = idMatch[1];
    
    const params = {
        variables: JSON.stringify({ focalTweetId: tweetId, with_rux_injections: false, rankingMode: "Relevance", includePromotedContent: true, withCommunity: true, withQuickPromoteEligibilityTweetFields: true, withBirdwatchNotes: true, withVoice: true }),
        features: JSON.stringify({ rweb_tipjar_consumption_enabled: true, responsive_web_graphql_exclude_directive_enabled: true, verified_phone_label_enabled: false, creator_subscriptions_tweet_preview_api_enabled: true, responsive_web_graphql_timeline_navigation_enabled: true, responsive_web_edit_tweet_api_enabled: true, graphql_is_translatable_rweb_tweet_is_translatable_enabled: true, view_counts_everywhere_api_enabled: true, longform_notetweets_consumption_enabled: true, tweet_awards_web_tipping_enabled: false, responsive_web_twitter_article_tweet_consumption_enabled: true, responsive_web_enhance_cards_enabled: false, c9s_tweet_anatomy_moderator_badge_enabled: true, freedom_of_speech_not_reach_fetch_enabled: true, longform_notetweets_rich_text_read_enabled: true, standardized_nudges_misinfo: true, creator_subscriptions_quote_tweet_preview_enabled: false, longform_notetweets_inline_media_enabled: true, articles_preview_enabled: true, rweb_video_timestamps_enabled: true, responsive_web_graphql_skip_user_profile_image_extensions_enabled: false, tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true, communities_web_enable_tweet_community_results_fetch: true }),
        fieldToggles: JSON.stringify({ withArticleRichContentState: true, withArticlePlainText: false, withGrokAnalyze: false, withDisallowedReplyControls: false })
    };
    try {
        const response = await axios.get('https://x.com/i/api/graphql/QuBlQ6SxNAQCt6-kBiCXCQ/TweetDetail', {
            headers: {
                'Authorization': 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
                'Content-Type': 'application/json',
                'x-csrf-token': '5819e285dd2cb1ac0ce9c5bea7bd086aea8561b3ef33073d0e2c91c0e892daeae851fd0abf0e18ba8e79db28ccbc4eac55d3a7b76985e2a1abd29fbc971e5138860c9d38485a80f9c572434efdae1f82',
                'cookie': cookie,
                'User-Agent': 'Mozilla/5.0'
            }, params
        });
        const tweet = response?.data?.data?.threaded_conversation_with_injections_v2?.instructions?.[0]?.entries?.[0]?.content?.itemContent?.tweet_results?.result?.tweet || response?.data?.data?.threaded_conversation_with_injections_v2?.instructions?.[0]?.entries?.[0]?.content?.itemContent?.tweet_results?.result;
        if(!tweet) return null;
        const user = tweet.core.user_results.result;
        const media = tweet.legacy?.entities?.media || [];
        const attachments = media.map(m => {
          if (m.type === "photo") return { type: "Photo", url: m.media_url_https };
          else if (m.type === "animated_gif" || m.type === "video") {
            const best = m.video_info.variants.reduce((p, c) => ((p.bitrate || 0) > (c.bitrate || 0) ? p : c), {});
            return { type: "Video", url: best.url };
          }
        }).filter(Boolean);

        const formatNb = (n) => n ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "0";

        return {
            id: tweet.legacy.id_str,
            message: tweet.legacy.full_text?.replace(/https?:\/\/t\.co\/[a-zA-Z0-9]+/g, '').trim(),
            author: `${user.legacy.name} (@${user.legacy.screen_name})`,
            created_at: tweet.legacy.created_at,
            comment: formatNb(tweet.legacy.reply_count),
            retweets: formatNb(tweet.legacy.retweet_count),
            like: formatNb(tweet.legacy.favorite_count),
            views: formatNb(tweet.views?.count),
            bookmark: formatNb(tweet.legacy.bookmark_count),
            attachments
        };
    } catch (error) { return null; }
}

export async function info(username) {
    try {
      const response = await axios.get(`https://api.fxtwitter.com/${username}`);
      const user = response?.data?.user;
      if (!user) return null;
      return {
        name: user.name,
        screen_name: user.screen_name,
        description: user.description || 'Không có',
        followers: user.followers || 0,
        following: user.following || 0,
        avatar: user.avatar_url?.replace('_normal', ''),
        banner: user.banner_url || null,
        created_at: user.joined || 'Không rõ'
      };
    } catch (error) { return null; }
}
