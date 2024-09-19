import * as alt from 'alt-server';
import * as Utility from '@Shared/utility/index.js';
import { useRebar } from '@Server/index.js';
import { lotteryConfig } from './config.js';
import { useDatabase } from '@Server/database/index.js';
import { ASCLottery, LotteryTicket } from './interface.js';
import { Character } from '@Shared/types/character.js';

const Rebar = useRebar();
const Database = useDatabase();
const NotificationAPI = await useRebar().useApi().getAsync('ascended-notification-api');
const CurrencyAPI = await useRebar().useApi().getAsync('currency-api');

/**
 * Range of valid numbers for the lottery.
 */
const numberRange = { min: 1, max: 49 };

/**
 * Time of day for the daily lottery draw.
 */
const drawTime = { hour: 18, minute: 0 };

/**
 * Initializes the lottery system.
 * Checks for existing lottery data in the database or creates new data if none exists.
 * Schedules the first draw.
 */
const initializeLottery = async (): Promise<void> => {
    let lotteryState = await Database.get<ASCLottery>({ type: 'lottery' }, 'misc');
    if (!lotteryState) {
        lotteryState = {
            type: 'lottery',
            ticketPrice: lotteryConfig.ticketPrice,
            jackpot: lotteryConfig.initialJackpot,
            lastDrawDate: new Date(0),
            winningNumbers: [],
        };
        const id = await Database.create(lotteryState, 'misc');
        if (id) lotteryState._id = id;
    }
    scheduleDraw();
};

/**
 * Generates an array of unique random numbers within a specified range.
 * @param {number} count Number of random numbers to generate.
 * @param {number} min Minimum value of the range.
 * @param {number} max Maximum value of the range.
 * @returns {number[]} Array of unique random numbers.
 */
const generateRandomNumbers = (count: number, min: number, max: number): number[] => {
    const numbers: Set<number> = new Set();
    while (numbers.size < count) {
        numbers.add(Math.floor(Math.random() * (max - min + 1)) + min);
    }
    return Array.from(numbers);
};

/**
 * Attempts to purchase a lottery ticket for a player.
 * @param {alt.Player} player Player attempting to buy the ticket.
 * @param {string} numbers String containing the chosen numbers separated by spaces.
 * @returns {Promise<LotteryTicket | null>} The purchased ticket or null if unsuccessful.
 */
export const buyTicket = async (player: alt.Player, numbers: string): Promise<LotteryTicket | null> => {
    const rPlayer = Rebar.document.character.useCharacter(player).get();
    const ticketNumbers = parseTicketNumbers(numbers);

    if (!ticketNumbers) {
        return null;
    }

    const existingTicket = await Database.get<LotteryTicket>(
        { playerUUID: rPlayer._id },
        lotteryConfig.ticketCollection,
    );

    if (existingTicket) {
        NotificationAPI.general.send(player, {
            title: 'ASC-Lottery',
            message: 'You already have a ticket for this draw.',
            icon: '❌',
        });
        return null;
    }

    // Deduct the ticket price from the player's currency
    const hasEnough = await CurrencyAPI.useCurrency(rPlayer._id, 'Character').sub('cash', lotteryConfig.ticketPrice);
    if (!hasEnough) {
        NotificationAPI.general.send(player, {
            title: 'ASC-Lottery',
            message: "You don't have enough money to buy a ticket.",
            icon: '❌',
        });
        return null;
    }

    const newTicket: LotteryTicket = {
        ticketNumbers,
        playerUUID: rPlayer._id,
    };

    const ticketId = await Database.create(newTicket, lotteryConfig.ticketCollection);
    if (!ticketId) return null;

    newTicket._id = ticketId;

    const lotteryState = await Database.get<ASCLottery>({ type: 'lottery' }, 'misc');
    if (lotteryState) {
        lotteryState.jackpot += lotteryState.ticketPrice;
        await Database.update(lotteryState, 'misc');
    }

    return newTicket;
};

/**
 * Parses a string of numbers into an array of numbers.
 * Returns null if the input is invalid.
 * @param {string} numbersString String containing the numbers separated by spaces.
 * @returns {number[] | null} Array of numbers or null if invalid.
 */
const parseTicketNumbers = (numbersString: string): number[] | null => {
    const numbers = numbersString.split(' ').map(Number);
    if (numbers.length !== 6 || numbers.some(isNaN) || numbers.some((n) => n < 1 || n > 49)) {
        return null;
    }
    return numbers;
};

/**
 * Draws the winning numbers for the lottery.
 * Updates the lottery state in the database.
 * Sends notifications to all players.
 * @returns {Promise<number[]>} Array of winning numbers.
 */
export const drawWinningNumbers = async (): Promise<number[]> => {
    const lotteryState = await Database.get<ASCLottery>({ type: 'lottery' }, 'misc');
    if (lotteryState) {
        lotteryState.winningNumbers = generateRandomNumbers(6, numberRange.min, numberRange.max);
        lotteryState.lastDrawDate = new Date();
        await Database.update(lotteryState, 'misc');

        const winningTickets = await Database.getAll<LotteryTicket & { _id: string }>(lotteryConfig.ticketCollection);

        let winnerName = 'No Winner today.';
        if (winningTickets.length > 0) {
            const jackpotShare = Math.floor(lotteryState.jackpot / winningTickets.length);

            for (const ticket of winningTickets) {
                const winnerCharacter = await Rebar.database
                    .useDatabase()
                    .get<Character>({ _id: ticket.playerUUID }, 'Characters');

                if (winnerCharacter) {
                    winnerName = winnerCharacter ? winnerCharacter.name : 'Unknown (Character not found)';
                    await CurrencyAPI.useCurrency(winnerCharacter._id, 'Character').add('bank', jackpotShare);
                }
            }

            lotteryState.jackpot = lotteryConfig.initialJackpot;
            await Database.update(lotteryState, 'misc');
        }

        NotificationAPI.general.sendAll({
            title: 'ASC-Lottery',
            message: `The lottery has been drawn! The winning numbers are: ${lotteryState.winningNumbers.join(
                ', ',
            )}.\nWinner: ${winnerName}`,
            icon: '🎉',
        });

        const allTickets = await Database.getAll(lotteryConfig.ticketCollection);
        for (const ticket of allTickets) {
            await Database.deleteDocument(ticket._id!, lotteryConfig.ticketCollection);
        }

        return lotteryState.winningNumbers;
    }
    return [];
};

/**
 * Checks if a ticket matches the winning numbers.
 * @param {LotteryTicket} ticket Ticket to check.
 * @param {number[]} winningNumbers Array of winning numbers.
 * @returns {boolean} True if the ticket wins, false otherwise.
 */
export const checkWinningTicket = (ticket: LotteryTicket, winningNumbers: number[]): boolean => {
    return ticket.ticketNumbers.every((num) => winningNumbers.includes(num));
};

/**
 * Schedules the next lottery draw.
 * Calculates the time until the next draw and sets a timeout.
 */
const scheduleDraw = (): void => {
    const now = new Date();
    const nextDraw = new Date(now.getFullYear(), now.getMonth(), now.getDate(), drawTime.hour, drawTime.minute, 0, 0);
    if (now > nextDraw) {
        nextDraw.setDate(nextDraw.getDate() + 1);
    }
    const timeUntilDraw = nextDraw.getTime() - now.getTime();

    setTimeout(async () => {
        await drawWinningNumbers();
        scheduleDraw();
    }, timeUntilDraw);
};

/**
 * Retrieves the current lottery ticket for a player.
 * @param {alt.Player} player Player to retrieve the ticket for.
 * @returns {Promise<LotteryTicket | null>} The player's ticket or null if they don't have one.
 */
export const getCurrentTicket = async (player: alt.Player): Promise<LotteryTicket | null> => {
    const rPlayer = Rebar.document.character.useCharacter(player).get();
    return await Database.get<LotteryTicket>({ playerUUID: rPlayer._id }, lotteryConfig.ticketCollection);
};

initializeLottery();
