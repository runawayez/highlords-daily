import {
  config,
  categories,
  feeds,
  publication,
  profile,
  editorial,
} from "../config.mjs";
import { digest } from "../utils/storage.mjs";
import { editionDate, validateDate } from "./run-state.mjs";
export function createContext(options = {}) {
  const date = options.date
    ? validateDate(options.date)
    : editionDate(config.timeZone);
  const settings = Object.freeze({ ...config });
  const fingerprint = digest({
    engine: 5,
    config: settings,
    categories,
    feeds,
    publication,
    profile,
    date,
    editorialOverrides: Object.fromEntries(
      Object.entries(process.env).filter(([key]) =>
        key.startsWith("EDITORIAL_"),
      ),
    ),
  });
  return {
    config: settings,
    categories,
    feeds,
    publication,
    profile,
    editorial,
    editionDate: date,
    fingerprint,
    reserveCandidates: [],
    options,
  };
}
