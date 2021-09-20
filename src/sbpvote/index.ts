// Script to distribute rewards.

import "../common/load-env"
import { requestWallet } from "../libwallet/http";
import BigNumber from "bignumber.js"
import { WebsocketConnection } from "../libwallet/ws";
import { dbPromise } from "../common/load-db";
import { tokenIds, tokenTickers } from "../common/constants";
import viteQueue from "../cryptocurrencies/viteQueue";
import { convert } from "../common/convert";
import * as vite from "vitejs-notthomiz"
import { getVITEAddressOrCreateOne } from "../wallet/address";
import SBPVote from "../models/SBPVote";
import { durationUnits } from "../common/util";

const ws = new WebsocketConnection()

Promise.all([
    dbPromise,
    ws.connect()
]).then(async () => {
    const rewardAddress = await getVITEAddressOrCreateOne("SBP", "Rewards")
    console.log(`Reward address: ${rewardAddress.address}`)
    ws.on("tx", async tx => {
        if(tx.to !== rewardAddress.address || tx.type !== "receive")return
        console.log(`Incoming transaction of ${convert(tx.amount, "RAW", tokenTickers[tx.token_id])} ${tokenTickers[tx.token_id]}`)
        if(tx.token_id !== tokenIds.VITE)return
        // we got the payout in vite.
        await viteQueue.queueAction(rewardAddress.address, async () => {
            const balances = await requestWallet("get_balances", rewardAddress.address)
            const viteBalance = new BigNumber(balances[tokenIds.VITE])
            const vitcBalance = new BigNumber(balances[tokenIds.VITC])
            // wait to have at least 500 vite before distributing.
            // will stop if someone sends a ridiculously low amount
            // to the reward address
            if(viteBalance.isLessThan(convert("500", "VITE", "RAW")))return
            // need vitc to work. The current multiplier is 100x
            if(!vitcBalance.isGreaterThan(0))return

            const votes = await requestWallet("get_sbp_votes", process.env.SBP_NAME || "VitaminCoinSBP")
            // Should we reward smart contracts ? I'm not sure but
            // I'll just assume no.
            let totalValid = new BigNumber(0)
            const validAddresses = []
            for(const address in votes.votes){
                // skip smart contracts
                if(vite.wallet.isValidAddress(address) === vite.wallet.AddressType.Contract)continue

                let sbpVote = await SBPVote.findOne({
                    address: address
                })
                if(!sbpVote){
                    // No document, create it ?
                    // means the wallet system was offline.
                    try{
                        sbpVote = await SBPVote.create({
                            since: new Date(),
                            address: address
                        })
                    }catch{}
                    //continue
                }else{
                    // if less than a day since registration.
                    //if(sbpVote.since.getTime() > Date.now()-durationUnits.h)continue
                }

                totalValid = totalValid.plus(votes.votes[address])
                validAddresses.push(address)
            }

            // if nobody is valid (shouldn't happen)
            // just stop here and keep the funds for later.
            if(totalValid.isEqualTo(0))return
            const vitcPayouts = []
            const cap = new BigNumber(convert(7500, "VITC", "RAW"))
            let totalVitc = new BigNumber(0)
            for(const address of validAddresses){
                let amount = new BigNumber(new BigNumber(votes.votes[address])
                    .div(totalValid)
                    .times(viteBalance)
                    .times(100)
                    .toFixed()
                    .split(".")[0])
                if(amount.isGreaterThan(cap)){
                    amount = cap
                }
                totalVitc = totalVitc.plus(amount)
                vitcPayouts.push([
                    address,
                    amount.toFixed()
                ])
            }
            if(vitcBalance.isLessThan(totalVitc)){
                console.error("Not enough vitc in balance. Needs "+convert(totalVitc, "RAW", "VITC"))
                return
            }
            const payouts = []
            for(const address of validAddresses){
                payouts.push([
                    address,
                    new BigNumber(votes.votes[address])
                        .div(totalValid)
                        .times(viteBalance)
                        .toFixed()
                        .split(".")[0]
                ])
            }
            
            const start = Date.now()

            await requestWallet("bulk_send", rewardAddress.address, payouts, tokenIds.VITE)
            await requestWallet("bulk_send", rewardAddress.address, vitcPayouts, tokenIds.VITC)

            console.log("Sent ! In", (Date.now()-start)/1000)
        })
    })
})

/*
requestWallet("get_sbp_votes", "VitaminCoinSBP")
.then((votes:{
    name: string,
    total: string,
    votes: {
        [address: string]: string
    }
}) => {
    const addresses = {}
    const total = new BigNumber(votes.total)
    const viteTotal = new BigNumber(695).shiftedBy(18)
    for(const address in votes.votes){
        const viteAmount = new BigNumber(new BigNumber(votes.votes[address])
            .div(total)
            .times(viteTotal)
            .toString()
            .split(".")[0])
            .shiftedBy(-18)
            .toFixed()
        addresses[address] = viteAmount
    }
    console.log(JSON.stringify(addresses, null, 4))
    let totalVite = 0
    for(const address in addresses){
        const amount = parseFloat(addresses[address])
        totalVite = totalVite+amount
    }
    console.log(JSON.stringify(totalVite, null, 4))
})
*/