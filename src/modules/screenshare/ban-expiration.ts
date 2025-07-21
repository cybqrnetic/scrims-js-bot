import { acquired } from "@module/sticky-roles"
import { DB } from "lib"
import { ScrimsBan } from "./ScrimBan"
import { logUnban, removeBan } from "./ban-command"

DB.addStartupTask(() => setInterval(() => expireBans().catch(console.error), 60 * 1000))
async function expireBans() {
    for (const ban of await ScrimsBan.find({ expiration: { $exists: true }, roles: { $exists: true } })) {
        if (ban.expiration!.valueOf() <= Date.now()) {
            acquired(ban.user, async () => {
                await removeBan(ban, `Scrim Ban Expired.`)
                await logUnban(ban, "Ban Expired")
            }).catch(console.error)
        }
    }
}
