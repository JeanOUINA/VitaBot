import { Tweet } from "..";
import Command from "../command";

export default new class Balance implements Command {
    public = false
    dm = true
    description = "Display your balance"
    extended_description = `Display your current balance`
    alias = ["balance", "bal"]
    usage = ""

    async execute(data:Tweet, args:string[], command:string){
        
    }
}