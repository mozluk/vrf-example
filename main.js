import {ethers} from "ethers";
import abi_VRFConsumer from "./abi_VRFConsumer.json" with { type: "json" }
import abi_VRFCoordinator from "./abi_VRFCoordinator.json" with { type: "json" }

const main = async () => {
    // Connect to the Tabi testnet RPC (override via TABI_RPC_URL if needed).
    const tabiRpc = process.env.TABI_RPC_URL ?? "https://rpc.testnet.tabichain.com/"
    // VRFConsumer contract address.
    const vrfConsumerAddr = process.env.VRF_CONSUMER_ADDRESS ?? "0xb484B5F803F912C074Ac204dC66114F06aBc2100"
    // Private key must come from the environment — never paste real keys into source files.
    const privateKey = process.env.PRIVATE_KEY

    if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
        throw new Error("Set PRIVATE_KEY (64-hex, optionally 0x-prefixed) in the environment before running.")
    }

    const provider = new ethers.JsonRpcProvider(tabiRpc);

    const wallet = new ethers.Wallet(privateKey, provider)

    const vrfConsumer = ethers.Contract.from(vrfConsumerAddr, abi_VRFConsumer, wallet)

    const requestId = await requestRandomWords(vrfConsumer)

    console.log("requestRandomWords requestId:", requestId)

    const randomWords = await listener(vrfConsumer, requestId)

    console.log("randomWords:", randomWords)
}

const requestRandomWords = async (vrfConsumer) => {
    const callbackGasLimit = 400000
    const numWords = 4
    const result = await (await vrfConsumer.requestRandomWords(callbackGasLimit, numWords)).wait()

    console.log("requestRandomWords hash:", result.hash)

    const RandomWordsRequested = ethers.Interface.from(abi_VRFCoordinator).parseLog(result.logs[0])

    return RandomWordsRequested.args.requestId
}


const listener = async (vrfConsumer, requestId) => {
    // Fail instead of hanging forever if the VRF response never arrives
    // (cancelled request, missed event, or dropped RPC subscription).
    const timeoutMs = Number(process.env.VRF_WAIT_TIMEOUT_MS ?? 300000)
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            vrfConsumer.removeAllListeners("RequestFulfilled")
            reject(new Error(`Timed out waiting for RequestFulfilled within ${timeoutMs} ms`))
        }, timeoutMs)

        vrfConsumer.once("RequestFulfilled", (_requestId, _randomWords) => {
            // Normalize both sides to BigInt so bytes32/uint256 representations compare reliably.
            if (BigInt(_requestId) === BigInt(requestId)) {
                clearTimeout(timer)
                vrfConsumer.removeAllListeners("RequestFulfilled")
                resolve(_randomWords)
            }
        })
    })
}


main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
