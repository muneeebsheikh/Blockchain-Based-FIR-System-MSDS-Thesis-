// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Stores integrity anchors for off-chain FIR payloads (content hash and Merkle batch roots).
contract FIRAnchor {
    event FIRAnchored(
        bytes32 indexed contentHash,
        address indexed submitter,
        uint256 timestamp,
        string externalId
    );

    event FIRBatchAnchored(
        bytes32 indexed merkleRoot,
        address indexed submitter,
        uint256 timestamp,
        string batchId
    );

    mapping(bytes32 => bool) private anchored;
    mapping(bytes32 => bool) private batchAnchored;

    error AlreadyAnchored(bytes32 contentHash);
    error AlreadyBatchAnchored(bytes32 merkleRoot);

    function anchor(bytes32 contentHash, string calldata externalId) external {
        if (anchored[contentHash]) revert AlreadyAnchored(contentHash);
        anchored[contentHash] = true;
        emit FIRAnchored(contentHash, msg.sender, block.timestamp, externalId);
    }

    function isAnchored(bytes32 contentHash) external view returns (bool) {
        return anchored[contentHash];
    }

    /// @notice Commit a Merkle root that covers many FIR content hashes off-chain.
    function anchorBatch(bytes32 merkleRoot, string calldata batchId) external {
        if (batchAnchored[merkleRoot]) revert AlreadyBatchAnchored(merkleRoot);
        batchAnchored[merkleRoot] = true;
        emit FIRBatchAnchored(merkleRoot, msg.sender, block.timestamp, batchId);
    }

    function isBatchAnchored(bytes32 merkleRoot) external view returns (bool) {
        return batchAnchored[merkleRoot];
    }
}
