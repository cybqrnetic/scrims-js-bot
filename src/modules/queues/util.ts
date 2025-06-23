import { MAIN_GUILD_ID } from "@Constants"
import { Config } from "@module/config"

const CATEGORIES_CONFIG = Config.declareType("Queue Categories")
export function isQueueCategory(category: string) {
    return Config.getConfigValue(CATEGORIES_CONFIG, MAIN_GUILD_ID)?.includes(category)
}
