#!/usr/bin/env python3
"""Exactly-once public courier for the authorized 1 XNO treasury test."""

import hashlib
import json
import time
import urllib.request

ALPHABET = "13456789abcdefghijkmnopqrstuwxyz"
RPCS = (
    "https://node.somenano.com/proxy",
    "https://nanoslo.0x.no/proxy",
    "https://rpc.nano.to",
)
SOURCE = "nano_1bfapscrwk7t66faz9emcqo318698d4yc9n7p8rh8gjuttg8ehgajgzw4bk1"
DESTINATION = "nano_1zo9c6wdzrdzriuxddw7y85ji3jdiph8g7ph1g9k5b1q9mpy9wyebgf37cxw"
AMOUNT_RAW = "1000000000000000000000000000000"
BALANCE_BEFORE = "3050000000000000000000000000000"
EXPECTED_HASH = "DB7E911DB7384DFC940D944067DF2B3BF60C2700BB85EF9AA3FB9F32D81784F8"
THRESHOLD = 0xFFFFFE0000000000
BLOCK = {
    "type": "state",
    "account": SOURCE,
    "previous": "CCABDCE0C1046D6F0AA82F80A87839CE98CD5E884D7660029579CA71BA3ABEC5",
    "representative": SOURCE,
    "balance": "2050000000000000000000000000000",
    "link": "7EA75138BFE17FC437D5AF85F18718062B859E6716CF038F21A4173CEDE3F3CC",
    "signature": "7BE2FD3B150C2E5091FF8CEEEFC2F5200D5364F72A26E9DCA9556A88652B79294C42D4DADE64E9302845E6C4DC43201E88E7E42D7F6B2FE05EBEE9A8CE55E502",
}


def decode_account(address):
    if not address.startswith("nano_") or len(address) != 65:
        raise ValueError("invalid Nano address")
    value = 0
    for char in address[5:57]:
        value = (value << 5) | ALPHABET.index(char)
    if value >> 256:
        raise ValueError("non-zero address padding")
    public_key = value.to_bytes(32, "big")
    check = 0
    for char in address[57:]:
        check = (check << 5) | ALPHABET.index(char)
    if check.to_bytes(5, "big") != hashlib.blake2b(public_key, digest_size=5).digest()[::-1]:
        raise ValueError("Nano checksum mismatch")
    return public_key


def block_hash(block):
    return hashlib.blake2b(
        bytes(31) + b"\x06"
        + decode_account(block["account"])
        + bytes.fromhex(block["previous"])
        + decode_account(block["representative"])
        + int(block["balance"]).to_bytes(16, "big")
        + bytes.fromhex(block["link"]),
        digest_size=32,
    ).hexdigest().upper()


def rpc(url, payload):
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "User-Agent": "wallenhof-treasury-courier/1"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode())


def first_success(payload):
    errors = []
    for url in RPCS:
        try:
            result = rpc(url, payload)
            if "error" not in result:
                return url, result
            errors.append({"url": url, "error": result["error"]})
        except Exception as exc:
            errors.append({"url": url, "error": f"{type(exc).__name__}: {exc}"})
    raise RuntimeError(json.dumps(errors))


def main():
    started = time.time()
    if block_hash(BLOCK) != EXPECTED_HASH:
        raise RuntimeError("offline block hash mismatch")
    decode_account(DESTINATION)

    _, history = first_success({"action": "account_history", "account": SOURCE, "count": "-1", "raw": "true"})
    matches = [
        item for item in history.get("history", [])
        if item.get("type") == "state"
        and item.get("subtype") == "send"
        and item.get("account") == DESTINATION
        and item.get("amount") == AMOUNT_RAW
    ]
    if matches:
        print(json.dumps({"status": "ALREADY_SENT_NO_SEND", "hash": matches[0]["hash"], "destination": DESTINATION, "amount_raw": AMOUNT_RAW}, sort_keys=True))
        return

    _, info = first_success({"action": "account_info", "account": SOURCE, "representative": "true", "include_confirmed": "true"})
    if info.get("frontier") != BLOCK["previous"] or info.get("confirmed_frontier") != BLOCK["previous"]:
        raise RuntimeError("source frontier changed; fail closed")
    if info.get("balance") != BALANCE_BEFORE or info.get("confirmed_balance") != BALANCE_BEFORE:
        raise RuntimeError("source balance changed; fail closed")
    if info.get("representative") != BLOCK["representative"]:
        raise RuntimeError("source representative changed; fail closed")

    work_url, work_result = first_success({"action": "work_generate", "hash": BLOCK["previous"], "difficulty": f"{THRESHOLD:016x}"})
    work = str(work_result["work"])
    work_value = int.from_bytes(hashlib.blake2b(bytes.fromhex(work)[::-1] + bytes.fromhex(BLOCK["previous"]), digest_size=8).digest(), "little")
    if work_value < THRESHOLD:
        raise RuntimeError("invalid proof of work")
    process_block = dict(BLOCK)
    process_block["work"] = work
    response = rpc(work_url, {"action": "process", "json_block": "true", "subtype": "send", "block": process_block})
    if str(response.get("hash", "")).upper() != EXPECTED_HASH:
        raise RuntimeError(f"unexpected process response: {response}")

    confirmation = None
    confirmation_url = None
    for _ in range(24):
        for url in RPCS:
            try:
                observed = rpc(url, {"action": "block_info", "hash": EXPECTED_HASH})
                if str(observed.get("confirmed", "")).lower() == "true":
                    confirmation, confirmation_url = observed, url
                    break
            except Exception:
                pass
        if confirmation:
            break
        time.sleep(5)
    if confirmation is None:
        raise RuntimeError("broadcast succeeded but confirmation was not observed")
    print(json.dumps({
        "status": "CONFIRMED",
        "hash": EXPECTED_HASH,
        "source": SOURCE,
        "destination": DESTINATION,
        "amount_raw": AMOUNT_RAW,
        "balance_after_raw": BLOCK["balance"],
        "broadcast_rpc": work_url,
        "confirmation_rpc": confirmation_url,
        "confirmation": confirmation,
        "elapsed_seconds": round(time.time() - started, 3),
    }, sort_keys=True))


if __name__ == "__main__":
    main()
