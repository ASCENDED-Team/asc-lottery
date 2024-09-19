/**
 * Interface for the ASC Lottery data stored in the database.
 */
export interface ASCLottery {
    /**
     * Database ID of the lottery document. Optional.
     * @type {string}
     */
    _id?: string;

    /**
     * Type identifier for the document. Always 'lottery'.
     * @type {string}
     */
    type: string;

    /**
     * Price of a single lottery ticket.
     * @type {number}
     */
    ticketPrice: number;

    /**
     * Current jackpot amount.
     * @type {number}
     */
    jackpot: number;

    /**
     * Date and time of the last draw.
     * @type {Date}
     */
    lastDrawDate: Date;

    /**
     * Array of winning numbers from the last draw.
     * @type {number[]}
     */
    winningNumbers: number[];
}

/**
 * Interface for a lottery ticket.
 */
export interface LotteryTicket {
    /**
     * Database ID of the ticket document. Optional.
     * @type {string}
     */
    _id?: string;

    /**
     * Array of 6 numbers representing the ticket.
     * @type {number[]}
     */
    ticketNumbers: number[];

    /**
     * UUID of the player who owns the ticket.
     * @type {string}
     */
    playerUUID: string;
}
