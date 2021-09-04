/* eslint-disable @typescript-eslint/no-unused-vars */

import { Tweet } from "."

export default class Command {
    description: string
    extended_description: string
    alias: string[]
    // Command usage where
    // <> is a mandatory argument
    // {} is an optional argument 
    usage: string
    hidden?: boolean
    public: boolean
    dm: boolean

    async execute(tweet:Tweet, args:string[], command:string):Promise<void>{
        throw new CommandError("The command wasn't defined in its file.")
    }
}

export class CommandError extends Error {
    name = "CommandError"
}