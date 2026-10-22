/** Hero word cycler words and the template key shown on the device stack for each word (same order). Shared by the
 *  server composition (home-hero.tsx) and the client choreography (hero-sync.tsx) — no "use client" here, so the
 *  server reads the real arrays instead of client references. */
export const HERO_WORDS = ["ร้านค้า", "คลินิก", "ร้านอาหาร", "คาเฟ่", "โรงแรม", "อีเวนต์", "สตูดิโอโยคะ", "ร้านเติมเกม", "สปา", "เอเจนซี"];
export const HERO_KEYS = ["shop", "clinic", "restaurant", "cafe", "hotel", "events", "course", "topup", "salon", "corporate"] as const;
