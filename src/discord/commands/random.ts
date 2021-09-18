import { Message } from "discord.js";
import { tokenIds } from "../../common/constants";
import { convert, tokenNameToDisplayName } from "../../common/convert";
import { getVITEAddressOrCreateOne } from "../../cryptocurrencies/vite";
import Command from "../command";
import discordqueue from "../discordqueue";
import help from "./help";
import BigNumber from "bignumber.js"
import viteQueue from "../../cryptocurrencies/viteQueue";
import { client } from "..";
import { randomFromArray } from "../../common/util";
import { throwFrozenAccountError } from "../util";
import Tip from "../../models/Tip";
import { getActiveUsers } from "../ActiviaManager";
import { requestWallet } from "../../libwallet/http";

export default new class RandomTipCommand implements Command {
    description = "Tip one random person amongst active users"
    extended_description = `Tip one random person amongst active users. 
If they don't have an account on the tipbot, it will create one for them.

Examples:
**Tip to one random person 50 ${tokenNameToDisplayName("VITC")}!**
.vrandom 50`

    alias = ["vr", "vrandom", "random"]
    usage = "<amount>"

    async execute(message:Message, args: string[], command: string){
        if(!message.guild){
            try{
                await message.react("❌")
            }catch{}
            return
        }
        const amountRaw = args[0]
        if(!amountRaw || !/^\d+(\.\d+)?$/.test(amountRaw)){
            await help.execute(message, [command])
            return
        }
        const amount = new BigNumber(amountRaw)
        if(amount.isLessThan(10)){
            try{
                await message.react("💊")
            }catch{}
            try{
                await message.react("❌")
            }catch{}
            await message.author.send(
                `The base amount for that random tip is too low. You need to tip at least 10 VITC.`
            )
            return
        }
        const userList = (await getActiveUsers(message.guildId))
            .filter(e => e !== message.author.id)
        if(userList.length < 2){
            await message.reply(`There are less than 2 active users. Cannot random tip. List of active users is: ${userList.map(e => client.users.cache.get(e)?.tag).join(", ")||"empty"}`)
            return
        }
        const user = randomFromArray(userList)
        const [
            address,
            recipient
        ] = await Promise.all([
            discordqueue.queueAction(message.author.id, async () => {
                return getVITEAddressOrCreateOne(message.author.id, "Discord")
            }),
            discordqueue.queueAction(user, async () => {
                return getVITEAddressOrCreateOne(user, "Discord")
            })
        ])

        if(address.paused){
            await throwFrozenAccountError(message, args, command)
        }

        await viteQueue.queueAction(address.address, async () => {
            try{
                await message.react("💊")
            }catch{}
            const balances = await requestWallet("get_balances", address.address)
            const token = tokenIds.VITC
            const balance = new BigNumber(balances[token])
            const totalAskedRaw = new BigNumber(convert(amount, "VITC", "RAW").split(".")[0])
            if(balance.isLessThan(totalAskedRaw)){
                try{
                    await message.react("❌")
                }catch{}
                await message.author.send(
                    `You don't have enough money to cover this tip. You need ${amount.toFixed()} VITC but you only have ${convert(balance, "RAW", "VITC")} VITC in your balance. Use .deposit to top up your account.`
                )
                return
            }
            const tx = await requestWallet(
                "send",
                address.address,
                recipient.address,
                totalAskedRaw.toFixed(),
                token
            )
            await Tip.create({
                amount: parseFloat(
                    convert(totalAskedRaw, "RAW", "VITC")
                ),
                user_id: message.author.id,
                date: new Date(),
                txhash: tx.hash
            })
            try{
                await message.react("873558842699571220")
            }catch{}
            try{
                const u = await client.users.fetch(user)
                await message.author.send({
                    content: `Tipped ${convert(totalAskedRaw, "RAW", "VITC")} VITC to ${u.tag}!`,
                    allowedMentions: {
                        users: [user]
                    }
                })
            }catch{}
        })
    }
}