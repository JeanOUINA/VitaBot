import mongoose, { Document, Schema } from "mongoose";

export interface IGiveawayWinner extends Document {
    message_id: string,
    user_id: string,
    date: Date,
    announce_id: string,
    channel_id: string,
    guild_id: string
}

const GiveawayWinner = new Schema<IGiveawayWinner>({
    message_id: {
        type: String,
        unique: true,
        required: true
    },
    announce_id: {
        type: String,
        unique: true
    },
    channel_id: {
        type: String,
        required: true
    },
    guild_id: {
        type: String,
        required: true
    },
    user_id: {
        type: String,
        required: true
    },
    date: {
        type: Date,
        required: true
    }
})

export default mongoose.model<IGiveawayWinner>("DiscordGiveawayWinner", GiveawayWinner);