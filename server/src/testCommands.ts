import * as alt from 'alt-server';
import { useRebar } from '@Server/index.js';
import { buyTicket, getCurrentTicket } from './functions.js';
import { useDatabase } from '@Server/database/index.js';
import { Character } from '@Shared/types/character.js';
import { lotteryConfig } from './config.js';
import { LotteryTicket } from './interface.js';

const Rebar = useRebar();
const Database = useDatabase();
const NotificationAPI = await useRebar().useApi().getAsync('ascended-notification-api');

/**
 * Command to buy a lottery ticket.
 * @example /buyticket <number> <number> <number> <number> <number> <number>
 */
Rebar.messenger.useMessenger().commands.register({
    name: 'buyticket',
    desc: '/buyticket <number> <number> <number> <number> <number> <number>',
    callback: async (player: alt.Player, ...numbers: string[]) => {
        if (numbers.length !== 6) {
            return NotificationAPI.general.send(player, {
                title: 'ASC-Lottery',
                message: `Invalid usage. Use: /buyticket <number> <number> <number> <number> <number> <number>`,
                icon: '❌',
            });
        }

        const result = await buyTicket(player, numbers.join(' '));
        if (!result) {
            NotificationAPI.general.send(player, {
                title: 'ASC-Lottery',
                message: `Failed to buy a ticket.`,
                icon: '❌',
            });
            return;
        }

        if (result) {
            NotificationAPI.general.send(player, {
                title: 'ASC-Lottery',
                message: `You bought a ticket with numbers: ${result.ticketNumbers.join(', ')}`,
                icon: '✅',
            });
        }
    },
});

/**
 * Command to simulate a lottery draw. (Admin Only)
 * @example /simulatedraw
 */
Rebar.messenger.useMessenger().commands.register({
    name: 'simulatedraw',
    desc: '/simulatedraw',
    options: {
        permissions: ['admin'],
    },
    callback: async (player: alt.Player) => {
        try {
            const lotteryState = await Database.get<{ type: string; winningNumbers: number[] }>(
                { type: 'lottery' },
                'misc',
            );
            if (lotteryState) {
                lotteryState.winningNumbers = Array(6)
                    .fill(0)
                    .map(() => Math.floor(Math.random() * 49) + 1);
                await Database.update(lotteryState, 'misc');

                const winningTicket = await Database.get<LotteryTicket>(
                    {
                        ticketNumbers: lotteryState.winningNumbers,
                    },
                    lotteryConfig.ticketCollection,
                );

                let winnerName = 'No Winner today.';
                if (winningTicket) {
                    const winnerCharacter = await Rebar.database
                        .useDatabase()
                        .get<Character>({ _id: winningTicket.playerUUID }, 'Characters');
                    winnerName = winnerCharacter ? winnerCharacter.name : 'Unknown (Character not found)';
                }

                NotificationAPI.general.sendAll({
                    title: 'ASC-Lottery',
                    message: `Simulated draw completed! The winning numbers are: ${lotteryState.winningNumbers.join(', ')}.\nWinner: ${winnerName}`,
                    icon: '🎲',
                });

                const allTickets = await Database.getAll<LotteryTicket & { _id: string }>(
                    lotteryConfig.ticketCollection,
                );
                alt.log(`Found ${allTickets.length} tickets to remove`);

                for (const ticket of allTickets) {
                    try {
                        const isDeleted = await Database.destroy(ticket._id, lotteryConfig.ticketCollection);
                        alt.log(`Successfully removed ticket ${ticket._id} - ${isDeleted}`);
                    } catch (deleteError) {
                        alt.logError(`Failed to remove ticket ${ticket._id}: ${deleteError}`);
                    }
                }
            }
        } catch (error) {
            alt.logError(`Error in simulatedraw command: ${error}`);
            NotificationAPI.general.send(player, {
                title: 'ASC-Lottery',
                message: 'An error occurred while simulating the draw.',
                icon: '❌',
            });
        }
    },
});

/**
 * Command to view your current lottery ticket.
 * @example /myticket
 */
Rebar.messenger.useMessenger().commands.register({
    name: 'myticket',
    desc: '/myticket',
    callback: async (player: alt.Player) => {
        const ticket = await getCurrentTicket(player);
        if (ticket) {
            NotificationAPI.general.send(player, {
                title: 'ASC-Lottery',
                message: `Your current ticket numbers are: ${ticket.ticketNumbers.map((n) => `[${n}]`).join(' ')}`,

                icon: '🎫',
            });
        } else {
            NotificationAPI.general.send(player, {
                title: 'ASC-Lottery',
                message: "You don't have a ticket for the current draw.",
                icon: '❌',
            });
        }
    },
});
