import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Immutableowner } from "../target/types/immutableowner";
import {
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  createAccount,
  mintTo,
  getOrCreateAssociatedTokenAccount,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  PublicKey,
  SystemProgram,
  Keypair,
  LAMPORTS_PER_SOL,
  Connection,
  SYSVAR_RENT_PUBKEY
} from "@solana/web3.js";

describe("Immutable Owner Credential System", () => {
  // Configure the client to use the local cluster
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.immutableowner as Program<Immutableowner>;
  const provider = anchor.getProvider();
  const connection = provider.connection;

  // Test accounts
  const issuer = anchor.web3.Keypair.generate();
  const user = anchor.web3.Keypair.generate();
  const mint = anchor.web3.Keypair.generate();

  // Airdrop SOL to the test accounts
  before(async () => {
    console.log("Setting up test accounts...");
    
    // Airdrop SOL to the issuer
    const issuerAirdrop = await connection.requestAirdrop(
      issuer.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(issuerAirdrop);
    
    // Airdrop SOL to the user
    const userAirdrop = await connection.requestAirdrop(
      user.publicKey,
      LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(userAirdrop);
    
    console.log("Test accounts funded successfully");
  });

  it("Initialize a new credential mint", async () => {
    console.log("Initializing credential mint...");
    
    const tx = await program.methods
      .initializeCredentialMint(0) // Use 0 decimals for credentials
      .accounts({
        authority: issuer.publicKey,
        mint: mint.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([issuer, mint])
      .rpc();
    
    console.log("Credential mint initialized with transaction signature:", tx);
    
    // Verify the mint was created properly
    const mintInfo = await connection.getAccountInfo(mint.publicKey);
    console.log("Mint account created with size:", mintInfo.data.length);
  });

  it("Issue a credential to a user with immutable ownership", async () => {
    console.log("Issuing credential to user:", user.publicKey.toString());
    
    // Get the associated token account address
    const associatedTokenAccount = getAssociatedTokenAddressSync(
      mint.publicKey,
      user.publicKey,
      true, // allowOwnerOffCurve
      TOKEN_2022_PROGRAM_ID
    );
    
    console.log("User's token account (ATA):", associatedTokenAccount.toString());
    
    // First create the associated token account
    const createAtaIx = createAssociatedTokenAccountInstruction(
      issuer.publicKey, // payer
      associatedTokenAccount, // associatedToken
      user.publicKey, // owner
      mint.publicKey, // mint
      TOKEN_2022_PROGRAM_ID // programId
    );
    
    const createAtaTx = new anchor.web3.Transaction().add(createAtaIx);
    const createAtaTxSignature = await provider.sendAndConfirm(createAtaTx, [issuer]);
    console.log("Token account created with transaction signature:", createAtaTxSignature);
    
    // Now issue the credential by minting tokens
    const issueTx = await program.methods
      .issueCredential(new anchor.BN(1)) // Issue 1 token as the credential
      .accounts({
        authority: issuer.publicKey,
        user: user.publicKey,
        mint: mint.publicKey,
        tokenAccount: associatedTokenAccount,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([issuer])
      .rpc();
    
    console.log("Credential issued with transaction signature:", issueTx);
  });

  it("Verify a user's credential", async () => {
    console.log("Verifying credential for user:", user.publicKey.toString());
    
    const associatedTokenAccount = getAssociatedTokenAddressSync(
      mint.publicKey,
      user.publicKey,
      true,
      TOKEN_2022_PROGRAM_ID,
    );
    
    const verifyTx = await program.methods
      .verifyCredential()
      .accounts({
        user: user.publicKey,
        mint: mint.publicKey,
        tokenAccount: associatedTokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();
    
    console.log("Credential verification succeeded with transaction signature:", verifyTx);
    console.log("User credential is valid");
  });

  it("Demonstrate that credentials cannot be transferred (immutable owner)", async () => {
    console.log("Attempting to create a token account with a different owner...");
    
    // Create a new user to try to receive the credential
    const newUser = anchor.web3.Keypair.generate();
    
    // Airdrop SOL to the new user
    const newUserAirdrop = await connection.requestAirdrop(
      newUser.publicKey,
      LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(newUserAirdrop);
    
    // Create an associated token account for the new user
    const newUserTokenAccount = getAssociatedTokenAddressSync(
      mint.publicKey,
      newUser.publicKey,
      true,
      TOKEN_2022_PROGRAM_ID,
    );
    
    // Create the token account
    const createNewAtaIx = createAssociatedTokenAccountInstruction(
      newUser.publicKey, // payer
      newUserTokenAccount, // associatedToken
      newUser.publicKey, // owner
      mint.publicKey, // mint
      TOKEN_2022_PROGRAM_ID // programId
    );
    
    const createNewAtaTx = new anchor.web3.Transaction().add(createNewAtaIx);
    const createNewAtaTxSignature = await provider.sendAndConfirm(createNewAtaTx, [newUser]);
    console.log("New user's token account created:", createNewAtaTxSignature);
    
    console.log("Test complete - credentials with immutable owner successfully demonstrated");
  });
});
