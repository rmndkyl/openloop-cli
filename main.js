import fetch from 'node-fetch';
import fs from 'fs';
import chalk from 'chalk';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { banner } from './utils/banner.js';
import { logger } from './utils/logger.js';

const getRandomQuality = () => {
    return Math.floor(Math.random() * (99 - 60 + 1)) + 60;
};

const getProxies = () => {
    return fs.readFileSync('proxy.txt', 'utf8').split('\n').map(line => line.trim()).filter(Boolean);
};

const getTokens = () => {
    return fs.readFileSync('token.txt', 'utf8').split('\n').map(line => line.trim()).filter(Boolean);
};

const shareBandwidth = async (token, proxy) => {
    const quality = getRandomQuality(); 
    const proxyAgent = new HttpsProxyAgent(proxy);
    const maxRetries = 5; 
    let attempt = 0;

    while (attempt < maxRetries) {
        try {
            const response = await fetch('https://api.openloop.so/bandwidth/share', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ quality }),
                agent: proxyAgent,
            });

            if (!response.ok) {
                throw new Error(`Failed to share bandwidth! Status: ${response.statusText}`);
            }

            const data = await response.json();

            const logBandwidthShareResponse = (response) => {
                if (response && response.data && response.data.balances) {
                    const balance = response.data.balances.POINT;
                    logger(
                        `Bandwidth shared Message: ${chalk.yellow(response.message)} | Score: ${chalk.yellow(quality)} | Total Earnings: ${chalk.yellow(balance)}`
                    );
                }
            };

            logBandwidthShareResponse(data);
            return; 
        } catch (error) {
            attempt++;
            if (attempt >= maxRetries) {
                logger(`Max retries reached. Skipping.`, 'error');
            } else {
                await new Promise((resolve) => setTimeout(resolve, 1000)); 
            }
        }
    }
};

const shareBandwidthForAllTokens = async () => {
    const tokens = getTokens();
    const proxies = getProxies();

    if (tokens.length !== proxies.length) {
        logger('The number of tokens and proxies do not match!', 'error');
        return;
    }

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const proxy = proxies[i];
        try {
            const response = await checkMissions(token, proxy);
            if (response && Array.isArray(response.missions)) {
                const availableMissionIds = response.missions
                    .filter(mission => mission.status === 'available')
                    .map(mission => mission.missionId);

                logger('Available Missions:', 'info', availableMissionIds.length);
                for (const missionId of availableMissionIds) {
                    logger(`Do and complete mission Id: ${missionId}`, 'info');
                    const completeMission = await doMissions(missionId, token, proxy)

                    logger(`Mission Id: ${missionId} Complete: ${completeMission.message}`)
                }
            }
        } catch (error) {
            logger('Error checking missions:', 'error', error);
        };

        try {
            await shareBandwidth(token, proxy);
        } catch (error) {
            logger(`Error processing token: ${token}, Error: ${error.message}`, 'error');
        }
    }
};
const checkMissions = async (token, proxy) => {
    try {
        const proxyAgent = new HttpsProxyAgent(proxy);

        const response = await fetch('https://api.openloop.so/missions', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            agent: proxyAgent,  
        });

        if (!response.ok) {
            throw new Error(`Failed to Fetch Missions! Status: ${response.statusText}`);
        }

        const data = await response.json();
        return data.data;

    } catch (error) {
        logger('Error Fetch Missions!', 'error', error.message);
    }
};
const doMissions = async (missionId, token, proxy) => {
    try {
        const proxyAgent = new HttpsProxyAgent(proxy);

        const response = await fetch(`https://api.openloop.so/missions/${missionId}/complete`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            agent: proxyAgent,  
        });

        if (!response.ok) {
            throw new Error(`Failed to Complete Missions! Status: ${response.statusText}`);
        }

        const data = await response.json();
        return data;

    } catch (error) {
        logger('Error Complete Missions!', 'error', error.message);
    }
};
const main = () => {
    logger(banner, 'debug');
    logger('Starting bandwidth sharing each minute...');
    shareBandwidthForAllTokens(); 
    setInterval(shareBandwidthForAllTokens, 60 * 1000); 
};

main();
