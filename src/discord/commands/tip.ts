import { Message } from "discord.js";
import { tokenIds } from "../../common/constants";
import { convert, tokenNameToDisplayName } from "../../common/convert";
import { getBalances, getVITEAddressOrCreateOne, sendVITE } from "../../cryptocurrencies/vite";
import Command from "../command";
import discordqueue from "../discordqueue";
import { generateDefaultEmbed, isDiscordUserArgument, parseDiscordUser } from "../util";
import help from "./help";
import BigNumber from "bignumber.js"
import viteQueue from "../../cryptocurrencies/viteQueue";

export default new class Tip implements Command {
    description = "Tip someone on Discord"
    extended_description = `Tip someone over Discord. 
If they don't have an account on the tipbot, it will create one for them.

Examples:
**Give one ${tokenNameToDisplayName("VITC")} to a single person**
.v 1 <@696481194443014174>
**Give one ${tokenNameToDisplayName("BAN")} to a single person**
.tip 1 ban <@696481194443014174>
**Give one ${tokenNameToDisplayName("VITC")} to more than one person**
.vitc 1 <@112006418676113408> <@862414189464256542>`

    alias = ["vitc", "v", "tip"]
    usage = "<amount> {currency} <...@someone>"

    async execute(message:Message, args: string[], command: string){
        let [
            amount,
            currencyOrRecipient,
            ...recipientsRaw
        ] = args
        if(!amount || !currencyOrRecipient)return help.execute(message, [command])
        if(!/^\d+(\.\d+)?$/.test(amount))return help.execute(message, [command])
        if(isDiscordUserArgument(currencyOrRecipient)){
            // user here
            recipientsRaw.push(currencyOrRecipient)
            currencyOrRecipient = "vitc"
        }
        currencyOrRecipient = currencyOrRecipient.toUpperCase()
        if(command !== "tip" && currencyOrRecipient !== "VITC"){
            message.reply(`Looks like you tried to use another currency than vitc. Please use the .tip command for this.`)
            return
        }

        if(!Object.keys(tokenIds).includes(currencyOrRecipient)){
            const embed = generateDefaultEmbed()
            .setDescription(`The token ${currencyOrRecipient} isn't supported. Supported tokens are:
${Object.keys(tokenIds).map(t => tokenNameToDisplayName(t)).join("\n")}`)
            await message.channel.send({
                embeds: [embed]
            })
            return
        }
        if(recipientsRaw.length === 0)return help.execute(message, [command])

        const recipients = []
        const errors = []
        const promises = []
        for(let recipient of recipientsRaw){
            promises.push((async () => {
                try{
                    const user = await parseDiscordUser(recipient)
                    // couldn't find it
                    if(!user)throw new Error()
                    // bot
                    if(user.bot)throw new Error()
                    // same person sending to itself
                    if(user.id === message.author.id)return 
                    recipients.push(user)
                }catch(err){
                    errors.push(recipient)
                }
            })())
        }
        await Promise.all(promises)
        if(errors.length > 0){
            await message.reply(`Couldn't resolve these users: ${errors.join(", ")}`)
        }
        if(recipients.length === 0)return

        const amountParsed = new BigNumber(amount)
        const totalAsked = amountParsed.times(recipients.length)

        const [
            address,
            addresses
        ] = await Promise.all([
            discordqueue.queueAction(message.author.id, async () => {
                return getVITEAddressOrCreateOne(message.author.id, "Discord")
            }),
            Promise.all(recipients.map(async (recipient) => {
                return discordqueue.queueAction(recipient.id, async () => {
                    return getVITEAddressOrCreateOne(recipient.id, "Discord")
                })
            }))
        ])

        await viteQueue.queueAction(address.address, async () => {
            const balances = await getBalances(address.address)
            let token = tokenIds[currencyOrRecipient]
            const balance = new BigNumber(token ? balances[token] || "0" : "0")
            if(balance.isLessThan(totalAsked)){
                await message.channel.send({
                    content: `You don't have enough money to cover this tip. You need ${totalAsked.toFixed()} ${currencyOrRecipient} but you only have ${balance.toFixed()} ${currencyOrRecipient}.`,
                    reply: {
                        messageReference: message,
                        failIfNotExists: false
                    }
                })
                return
            }
            for(let recipient of addresses){
                await sendVITE(
                    address.seed, 
                    recipient.address, 
                    convert(amount, currencyOrRecipient, "RAW"), 
                    token
                )
            }
            await message.channel.send({
                content: `A total of ${totalAsked.toFixed()} ${tokenNameToDisplayName(currencyOrRecipient)} was sent to ${addresses.length} recipient(s) !`,
                reply: {
                    messageReference: message,
                    failIfNotExists: false
                }
            })
        })
    }
}