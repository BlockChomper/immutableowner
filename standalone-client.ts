import {
  Connection,
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

import {
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  createInitializeMintInstruction,
  createInitializeNonTransferableMintInstruction,
  getMintLen,
  mintTo,
  createAccount,
  createTransferCheckedInstruction,
  getOrCreateAssociatedTokenAccount,
  createMintToInstruction,
} from "@solana/spl-token";

// Connect to the local test validator
const connection = new Connection("http://localhost:8899", "confirmed");

// Main function to demonstrate the non-transferable mint
async function main() {
  try {
    console.log("=== Non-Transferable Token Demo ===");
    console.log("Using local validator at http://localhost:8899");
    console.log("Make sure you have a validator running with: solana-test-validator\n");
    
    // Generate a new keypair for the payer
    const payer = Keypair.generate();
    console.log("Payer pubkey:", payer.publicKey.toBase58());

    // Airdrop some SOL to the payer on local validator (this works more reliably than devnet)
    const airdropSignature = await connection.requestAirdrop(
      payer.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(airdropSignature);
    console.log("Airdropped 2 SOL to payer\n");

    // Generate a new keypair for the mint
    const mintKeypair = Keypair.generate();
    console.log("Mint pubkey:", mintKeypair.publicKey.toBase58());

    // =========== STEP 1: Calculate space and rent for the mint account ==========
    console.log("Step 1: Calculating account space and rent...");
    const extensions = [ExtensionType.NonTransferable];
    const mintLen = getMintLen(extensions);
    console.log(`- Mint account size: ${mintLen} bytes`);

    const mintLamports = await connection.getMinimumBalanceForRentExemption(mintLen);
    console.log(`- Minimum lamports for rent exemption: ${mintLamports}\n`);

    // =========== STEP 2: Create the mint transaction with required instructions ==========
    console.log("Step 2: Creating a non-transferable mint...");
    console.log("- Creating transaction with the required instructions:");
    console.log("  1. SystemProgram.createAccount");
    console.log("  2. createInitializeNonTransferableMintInstruction"); 
    console.log("  3. createInitializeMintInstruction");
    
    // 1. Create account instruction
    const createAccountInstruction = SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: mintLen,
      lamports: mintLamports,
      programId: TOKEN_2022_PROGRAM_ID,
    });

    // 2. Initialize non-transferable extension instruction
    const initializeNonTransferableMintInstruction = createInitializeNonTransferableMintInstruction(
      mintKeypair.publicKey,
      TOKEN_2022_PROGRAM_ID,
    );

    // 3. Initialize mint instruction
    const decimals = 0; // Using 0 decimals for a credential-type token
    const initializeMintInstruction = createInitializeMintInstruction(
      mintKeypair.publicKey,
      decimals,
      payer.publicKey,
      null, // No freeze authority
      TOKEN_2022_PROGRAM_ID,
    );

    // Add all instructions to the transaction
    const mintTransaction = new Transaction().add(
      createAccountInstruction,
      initializeNonTransferableMintInstruction,
      initializeMintInstruction,
    );

    // Send and confirm the transaction
    const mintSignature = await sendAndConfirmTransaction(
      connection,
      mintTransaction,
      [payer, mintKeypair],
      { commitment: "confirmed" },
    );

    console.log("- Non-transferable mint created successfully");
    console.log(`- Transaction signature: ${mintSignature}\n`);

    // =========== STEP 3: Create a token account and mint some tokens ==========
    console.log("Step 3: Creating token account and minting tokens...");
    
    // Create an associated token account for the payer
    console.log("- Creating token account for payer...");
    const tokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      mintKeypair.publicKey,
      payer.publicKey,
      false,
      "confirmed",
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID,
    );

    console.log(`- Token account created: ${tokenAccount.address.toBase58()}`);

    // Mint 1 token to the payer's token account - using manual transaction instead of mintTo helper
    console.log("- Minting token to payer...");
    const amount = 1; // 1 token with 0 decimals
    
    // Create a mintTo instruction
    const mintToInstruction = createMintToInstruction(
      mintKeypair.publicKey,
      tokenAccount.address,
      payer.publicKey,
      amount,
      [],
      TOKEN_2022_PROGRAM_ID
    );
    
    // Create and send the transaction
    const mintToTransaction = new Transaction().add(mintToInstruction);
    const mintToSignature = await sendAndConfirmTransaction(
      connection,
      mintToTransaction,
      [payer],
      { commitment: "confirmed" }
    );

    console.log("- Token minted successfully");
    console.log(`- Mint transaction signature: ${mintToSignature}\n`);

    // =========== STEP 4: Create another token account and attempt to transfer ==========
    console.log("Step 4: Testing non-transferability...");
    
    // Create another keypair to receive tokens
    const recipient = Keypair.generate();
    console.log(`- Recipient pubkey: ${recipient.publicKey.toBase58()}`);

    // Airdrop some SOL to the recipient for account creation
    const recipientAirdrop = await connection.requestAirdrop(
      recipient.publicKey,
      0.1 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(recipientAirdrop);
    console.log("- Airdropped 0.1 SOL to recipient");

    // Create a token account for the recipient
    console.log("- Creating token account for recipient...");
    const recipientTokenAccount = await createAccount(
      connection,
      payer,
      mintKeypair.publicKey,
      recipient.publicKey,
      undefined,
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID,
    );

    console.log(`- Recipient token account created: ${recipientTokenAccount.toBase58()}`);

    // Attempt to transfer token (should fail due to non-transferable)
    console.log("- Attempting to transfer non-transferable token (this should fail)...");
    try {
      // Create a transfer instruction
      const transferInstruction = createTransferCheckedInstruction(
        tokenAccount.address,
        mintKeypair.publicKey,
        recipientTokenAccount,
        payer.publicKey,
        amount,
        decimals,
        [],
        TOKEN_2022_PROGRAM_ID
      );
      
      // Create and send the transaction
      const transferTransaction = new Transaction().add(transferInstruction);
      const transferSignature = await sendAndConfirmTransaction(
        connection,
        transferTransaction,
        [payer],
        { commitment: "confirmed" }
      );
      
      console.log("! Transfer succeeded (unexpected!): ", transferSignature);
    } catch (error) {
      console.log("✓ Transfer failed as expected");
      console.log("✓ Error message:", error.message);
      if (error.logs) {
        console.log("✓ Transaction logs:", error.logs);
      }
    }

    console.log("\n=== Non-transferable mint demonstration completed successfully! ===");
    console.log("This shows how to correctly initialize and use a non-transferable token.");
    console.log("Key points:");
    console.log("1. Use the correct sequence: createAccount → initializeNonTransferableMint → initializeMint");
    console.log("2. Calculate the correct account size with getMintLen([ExtensionType.NonTransferable])");
    console.log("3. Ensure account has enough lamports for rent exemption");
    console.log("4. Tokens can be minted but not transferred between accounts");
    
  } catch (error) {
    console.error("Error in main:", error);
  }
}

// Run the main function
main().then(() => console.log("Demo complete")).catch(err => console.error(err)); 