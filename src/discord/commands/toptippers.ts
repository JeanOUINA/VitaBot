import BigNumber from "bignumber.js";
import { Message } from "discord.js";
import { tokenIds } from "../../common/constants";
import { tokenNameToDisplayName } from "../../common/convert";
import { tokenPrices } from "../../common/price";
import TipStats from "../../models/TipStats";
import Command from "../command";
import { VITC_ADMINS, whitelistedBots } from "../constants";
import { generateDefaultEmbed, parseDiscordUser } from "../util";

export default new class TopTippersCommand implements Command {
    description = "See the bot's top tippers"
    extended_description = `Display a list of the best tippers.

Examples:
**See top tippers**
.toptippers`

    alias = ["toptippers"]
    usage = ""

    async execute(message:Message, args:string[]){
        const currency = (args[0] || "vitc").toUpperCase()
        if(!(currency in tokenIds)){
            try{
                await message.react("❌")
            }catch{}
            await message.reply(`The token **${currency}** isn't supported.`)
            return
        }
        const token = tokenIds[currency]
        const adminsOnly = args[1] === "admins"
        const [
            topTippers,
            totalTipped
        ] = await Promise.all([
            TipStats.aggregate([
                {
                    $match: {
                        tokenId: token
                    }
                },
                {
                    $group: {
                        _id: "$user_id",
                        sum: {
                            $sum: "$amount"
                        }
                    }
                }
            ]),
            TipStats.aggregate([
                {
                    $match: {
                        tokenId: token
                    }
                },
                {
                    $group: {
                        _id: "$tokenId",
                        amount: {
                            $sum: "$amount"
                        }
                    }
                }
            ])
        ])
        const topTipps = topTippers
        .filter(e => {
            if(whitelistedBots.includes(e._id))return false
            if(token === tokenIds.VITC)return !adminsOnly ? !VITC_ADMINS.includes(e._id) : VITC_ADMINS.includes(e._id)
            return true
        })
        .sort((a, b) => b.sum-a.sum)
        .slice(0, 15)
        
        const Tippers = await Promise.all(
            topTipps.map(async e => {
                return {
                    amount: e.sum,
                    user: (await parseDiscordUser(e._id))[0]
                }
            })
        )
        
        let totalAmount = 0
        if(totalTipped[0]){
            totalAmount = Math.floor(totalTipped[0].amount*100)/100
        }

        const pair = tokenPrices[token+"/"+tokenIds.USDT]

        const embed = generateDefaultEmbed()
        .setDescription(`**Top 15 Tippers 🔥**
        
${Tippers.map((Tiper, i) => {
    return `${i+1}. **${Math.floor(Tiper.amount*100)/100} ${currency}**  (= **$${
        new BigNumber(pair?.closePrice || 0)
            .times(Tiper.amount)
            .decimalPlaces(2).toFixed(2)
    }**) - By **${Tiper.user?.tag}${i==0?" 👑":""}**`
}).join("\n") || "Looks like the list is empty..."}

Total Amount Tipped: **${totalAmount} ${tokenNameToDisplayName(currency)}** (= **$${
    new BigNumber(pair?.closePrice || 0)
        .times(totalAmount)
        .decimalPlaces(2).toFixed(2)
}**)`)


        await message.reply({
            embeds: [embed]
        })
    }
}