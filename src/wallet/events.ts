import { VitaBotEventEmitter } from "../common/events";

export interface Transaction {
    type: "send"|"receive",
    from: string,
    to: string,
    hash: string,
    token_id: string,
    amount: string,
    sender_handle: string
}

export interface SendTransaction extends Transaction {
    type: "send"
}


export interface ReceiveTransaction extends Transaction {
    type: "receive",
    from_hash: string
}

export interface SBPMessageStats {
    vitc: string,
    vite: string
}

export default new VitaBotEventEmitter<{
    send_transaction: [SendTransaction],
    receive_transaction: [ReceiveTransaction],
    sbp_message: [SBPMessageStats]
}>()