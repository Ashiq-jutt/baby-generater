// Picks the data layer. Keeping this in its own file means neither
// implementation imports the other.
import type { DataLayer } from "./index";
import { fakeData } from "./fake";

let impl: DataLayer = fakeData;

if (process.env.EXPO_PUBLIC_USE_REAL_BACKEND === "1") {
  // required lazily so the fake layer works with no env vars set at all
  const { supabaseData } = require("./supabase") as { supabaseData: DataLayer };
  impl = supabaseData;
}

export const data = impl;
