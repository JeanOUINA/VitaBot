import { Platform } from "../common/constants"
import Address, { IAddress } from "../models/Address"
import * as vite from "vitejs-notthomiz"

const addressCache = new Map<string, IAddress>()

export async function getVITEAddress(id:string, platform:Platform):Promise<IAddress>{
    const address = await Address.findOne({
        network: "VITE",
        handles: `${id}.${platform}`
    })
    if(!address)throw new Error("Couldn't find an address in DB")
    return address
}

export async function getVITEAddressOrCreateOne(id:string, platform:Platform):Promise<IAddress>{
    const handle = `${id}.${platform}`
    if(addressCache.has(handle))return addressCache.get(handle)
    try{
        const address = await getVITEAddress(id, platform)
        addressCache.set(handle, address)
        return address
    }catch(err){
        // address doesn't exist in db, create it
        const wallet = vite.wallet.createWallet()
        const addr = wallet.deriveAddress(0)
        const address = await Address.create({
            network: "VITE",
            seed: wallet.seedHex,
            address: addr.address,
            handles: [
                `${id}.${platform}`
            ]
        })
        addressCache.set(handle, address)
        return address
    }
}