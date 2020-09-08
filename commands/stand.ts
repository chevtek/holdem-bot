import { Message } from "discord.js";
import { ChannelTable } from "../models";

export const command = ["stand [user]", "leave"];

export const description = "Leave the current game.";

export const builder = yargs => yargs
  .positional("user", {
    description: "The table creator can @mention a user to forcibly remove them from the table.",
    type: "string"
  });

export async function handler ({ discord, user }) {
  const message = discord.message as Message;
  let table = await ChannelTable.findByChannelId(message.channel.id);
  if (!table) {
    table = await ChannelTable.findByPlayerId(message.author.id);
    if (!table) {
      if (message.channel.type === "dm") {
        message.reply("You do not have an active Hold'em table.");
      } else {
        message.reply("There is no active Hold'em game in this channel.");
      }
      return;
    }
  }
  let userId: string|undefined = message.author.id;
  if (user) {
    if (message.author.id !== table.creatorId) {
      await message.reply("Only the table creator can forcibly remove a player.");
      return;
    }
    userId = user.match(/^<@!?(.+)>$/)?.[1];
    if (!userId) {
      userId = message.guild?.members.cache.find(member => member.displayName.toLowerCase() === user)?.id;
      if (!userId) {
        await message.reply("Invalid user specified.");
        return;
      }
    }
  }
  if (userId !== message.author.id) {
    await message.reply(`Are you sure you want to remove <@${userId}> from the table? (y/n)`);
  } else {
    await message.reply("Are you sure you want to leave the game? (y/n)")
  }
  try {
    const collected = await message.channel.awaitMessages(
      response => {
        if (response.author.id !== message.author.id) return false;
        return ["yes", "y", "no", "n"].includes(response.content.toLowerCase());
      },
      { max: 1, time: 20000, errors: ["time"] }
    );
    if (!["yes", "y"].includes(collected.first()!.content.toLowerCase())) return;
    if (table.currentActor?.id === message.author.id) {
      table.prompt?.resolve?.();
    }
    table.standUp(message.author.id);
    await table.render();
    if (message.author.id !== userId) {
      await message.reply(`<@${userId}> has been removed from the table.`);
    } else {
      await message.reply("You have left your active Hold'em table.");
    }
    const players = table.players.filter(player => player !== null);
    if (players.length > 0) {
      if (table.creatorId === userId) {
        const [newOwner] = players;
        table.creatorId = newOwner!.id;
        await message.channel.send(`<@${table.creatorId}>, you are now the table owner.`);
      }
      await table.saveToDb();
    } else {
      await table.deleteFromDb();
      await message.reply("No more players at the table. The table has been destroyed.");
    }
  } catch (err) {
    if (!err.message) {
      await message.reply("No confirmation received. You are still playing!");
    } else {
      await message.reply(err.message);
    }
  }
}