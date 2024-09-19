import { useApi } from '@Server/api/index.js';
import { buyTicket } from './functions.js';

function useLotteryAPI() {
    const core = {
        buyTicket: buyTicket,
    };

    return {
        core,
    };
}

declare global {
    export interface ServerPlugin {
        ['ascended-lottery-api']: ReturnType<typeof useLotteryAPI>;
    }
}

useApi().register('ascended-lottery-api', useLotteryAPI());
