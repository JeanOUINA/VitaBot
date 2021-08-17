import { Message } from "discord.js";
import { tokenIds } from "../../common/constants";
import { convert, tokenNameToDisplayName } from "../../common/convert";
import { getBalances, getVITEAddressOrCreateOne, sendVITE, viteEvents } from "../../cryptocurrencies/vite";
import Command from "../command";
import discordqueue from "../discordqueue";
import help from "./help";
import BigNumber from "bignumber.js"
import viteQueue from "../../cryptocurrencies/viteQueue";
import rain from "./rain";
import { resolveDuration } from "../../common/util";
import Giveaway from "../../models/Giveaway";
import { generateDefaultEmbed, throwFrozenAccountError } from "../util";

export default new class GiveawayCommand implements Command {
    description = "Start a new giveaway"
    extended_description = `Start a new giveaway !
You must have a @Giveaway role.

Examples:
**Start a ${tokenNameToDisplayName("VITC")} !**
.gs 50 `

    alias = ["giveaway", "gs", "gstart"]
    usage = "<amount> {currency} <winners> <duration>"

    async execute(message:Message, args: string[], command: string){
        if(message.author.id !== "696481194443014174"){
            await message.channel.send("That command is limited to Thomiz. Please don't use it.")
            return
        }
        if(!message.guildId || !rain.allowedGuilds.includes(message.guildId)){
            await message.reply(`The \`${command}\` is not enabled in this server. Please contact the bot's operator`)
            return
        }
        let [
            // eslint-disable-next-line prefer-const
            amountRaw,
            currencyOrWinnersRaw,
            winnersOrDurationRaw,
            durationRaw
        ] = args
        if(!durationRaw){
            // shift every arguments
            durationRaw = winnersOrDurationRaw
            winnersOrDurationRaw = currencyOrWinnersRaw
            currencyOrWinnersRaw = "vitc"
        }
        if(!amountRaw || !/^\d+(\.\d+)?$/.test(amountRaw)){
            await help.execute(message, [command])
            return
        }
        if(!winnersOrDurationRaw || !/^\d+$/.test(winnersOrDurationRaw) || winnersOrDurationRaw.length > 3){
            await help.execute(message, [command])
            return
        }
        if(!durationRaw){
            durationRaw = "10m"
        }
        currencyOrWinnersRaw = currencyOrWinnersRaw.toUpperCase()
        if(!Object.keys(tokenIds).includes(currencyOrWinnersRaw)){
            try{
                await message.react("❌")
            }catch{}
            message.author.send(`The token ${currencyOrWinnersRaw} isn't supported. Use the command ${process.env.DISCORD_PREFIX}lstokens to see a list of supported tokens.`)
            return
        }
        const maxDurationStr = message.member.permissions.has("MANAGE_CHANNELS") ? 
            "2w" : "1d"
        const maxDuration = resolveDuration(maxDurationStr)
        const [
            amount,
            tokenId,
            winners,
            duration
        ] = [
            new BigNumber(amountRaw),
            tokenIds[currencyOrWinnersRaw],
            parseInt(winnersOrDurationRaw),
            resolveDuration(durationRaw)
        ]
        try{
            await message.react("💊")
        }catch{}
        if(amount.isEqualTo(0)){
            try{
                await message.react("❌")
            }catch{}
            await message.author.send(
                `You can't start a giveaway for 0 ${currencyOrWinnersRaw}.`
            )
            return
        }
        if(winners === 0){
            try{
                await message.react("❌")
            }catch{}
            await message.author.send(
                `You can't start a giveaway with 0 winners.`
            )
            return
        }
        const totalAmount = amount.times(winners)
        if(duration > maxDuration){
            try{
                await message.react("❌")
            }catch{}
            message.author.send(`The maximum duration you are allowed to for a giveaway is ${maxDurationStr}. You need the MANAGE_CHANNELS permission to make a giveaway last longer.`)
            return
        }
        const botMessage = await message.channel.send("Creating giveaway... Creating addresses and waiting for queue...")
        const [
            address,
            giveawayLockAddress
        ] = await discordqueue.queueAction(message.author.id, async () => {
            return Promise.all([
                getVITEAddressOrCreateOne(message.author.id, "Discord"),
                getVITEAddressOrCreateOne(message.author.id, "Discord.Giveaway"),
            ])
        })

        if(address.paused){
            await throwFrozenAccountError(message, args, command)
        }

        await viteQueue.queueAction(address.address, async () => {
            try{
                await botMessage.edit("Creating giveaway... Locking funds...")
            }catch{}
            const balances = await getBalances(address.address)
            const balance = new BigNumber(balances[tokenId] || "0")
            const totalAmountRaw = new BigNumber(convert(totalAmount, currencyOrWinnersRaw, "RAW").split(".")[0])
            if(balance.isLessThan(totalAmountRaw)){
                try{
                    await message.react("❌")
                }catch{}
                try{
                    await botMessage.delete()
                }catch{}
                await message.author.send(
                    `You don't have enough money to cover this giveaway. You need ${totalAmount.toFixed()} ${currencyOrWinnersRaw} but you only have ${convert(balance, "RAW", currencyOrWinnersRaw)} ${currencyOrWinnersRaw} in your balance. Use .deposit to top up your account.`
                )
                return
            }
            const hash = await sendVITE(
                address.seed, 
                giveawayLockAddress.address, 
                totalAmountRaw.toFixed(), 
                tokenId
            )
            await new Promise(r => {
                viteEvents.on("receive_"+hash, r)
            })
            // Funds are SAFU, create an entry in the database
            const giveaway = await Giveaway.create({
                date: Date.now()+Number(duration),
                message_id: botMessage.id,
                channel_id: message.channelId,
                guild_id: message.guildId,
                winners: winners,
                total_amount: totalAmountRaw.toFixed(),
                token_id: tokenId,
                user_id: message.author.id,
                currency: currencyOrWinnersRaw
            })
            const embed = generateDefaultEmbed()
            .setTitle(`${amount.toFixed()} ${currencyOrWinnersRaw}`)
            .setDescription(`React with 💊 to enter !
Ends at <t:${Math.floor(giveaway.date.getTime()/1000)}>
Winners: ${winners}
Total Amount: ${totalAmount.toFixed()} ${currencyOrWinnersRaw}`)
            await botMessage.react("💊")
            await botMessage.edit({
                embeds: [embed],
                content: ""
            })
        })
    }
}