import express from "express"
import http from "http"
import Joi from "joi"
import * as WebSocket from "ws"
import * as fs from "fs"
import { join } from "path"
import events from "./events"

console.log("Launching server")

const actions = new Map<string, (args:any[]) => Promise<any>>()

for(const file of fs.readdirSync(join(__dirname, "actions"))){
    const action = file.split(".")[0]
    actions.set(action, require(join(__dirname, "actions", file)).default)
}

const app = express()
.post(
    "/", 
    (req, res, next) => {
        const authorization = req.header("Authorization")
        if(authorization !== process.env.WALLET_API_KEY){
            res.status(401).send({
                error: {
                    name: "AuthenticationError",
                    message: "Invalid Authorization Header."
                }
            })
            return
        }
        next()
    },
    async (req, res, next) => {
        let data = ""
        req.setEncoding("utf8")
        req.on("data", chunk => { 
            data += chunk
        })
        req.on("end", () => {
            req.body = data
            next()
        })
    },
    async (req, res, next) => {
        try{
            const body = JSON.parse(req.body)
            req.body = await Joi.object({
                action: Joi.string().required().custom(action => {
                    if(!actions.has(action)){
                        throw new TypeError("Invalid Action.")
                    }
                    return action
                }),
                params: Joi.array().default([])
            }).required().validateAsync(body)
            next()
        }catch(err){
            res.status(400).send({
                error: {
                    name: err?.name||"ParsingError",
                    message: err?.message||"Couldn't parse the body of the request."
                }
            })
        }
    },
    async (req, res) => {
        const action = actions.get(req.body.action)
        try{
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            const result = await action(...(req.body.params || []))
            res.status(200).send(result)
        }catch(err){
            res.status(500).send({
                error: {
                    name: err?.name || "Error",
                    message: err?.message || err ? String(err) : ""
                }
            })
        }
    }
).use((req, res) => {
    res.status(400).send({
        error: {
            name: "RoutingError",
            message: "Not Found"
        }
    })
})

const listenPort = parseInt(process.env.WALLET_PORT||"43430")
if(isNaN(listenPort)){
    throw new Error("Invalid port: "+process.env.WALLET_PORT)
}
const server = http.createServer(app)
.listen(listenPort, () => {
    console.log("Listening on http://[::1]:"+listenPort)
})


const wss = new WebSocket.Server({
    server
})

wss.on("connection", (ws, req) => {
    if(req.headers.authorization !== process.env.WALLET_API_KEY){
        ws.terminate()
        return
    }
    ws.send(JSON.stringify({
        op: "henlo",
        d: "e"
    }))
    const createPingTimeout = () => setTimeout(() => {
        ws.send(JSON.stringify({
            op: "ping",
            d: Date.now()
        }))
        pingTimeout = setTimeout(() => {
            ws.close(1000)
        }, 15*1000)
    }, 30*1000)
    let pingTimeout = createPingTimeout()
    ws.on("message", data => {
        try{
            const msg = JSON.parse(String(data))
            if(typeof msg !== "object" || !("op" in msg))return
            switch(msg.op){
                case "pong": {
                    clearTimeout(pingTimeout)
                    pingTimeout = createPingTimeout()
                }
            }
        }catch{}
    })

    const listener = tx => {
        ws.send(JSON.stringify({
            op: "tx",
            d: tx
        }))
    }
    events.on("receive_transaction", listener)
    events.on("send_transaction", listener)
    ws.on("close", () => {
        events.off("receive_transaction", listener)
        events.off("send_transaction", listener)
    })
})