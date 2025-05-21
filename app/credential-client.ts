import * as web3 from '@solana/web3.js';
import * as token from '@solana/spl-token';
import * as anchor from '@coral-xyz/anchor';
import { Program, Idl, BN, AnchorProvider } from '@coral-xyz/anchor';
import fs from 'fs';
import path from 'path';

// This client application demonstrates how to use the Immutable Owner credential system
// in a real-world identity verification scenario

// Define a type for the IDL to avoid excessive type instantiation depth
interface ImmutableownerIDL {
  version: string;
  name: string;
  instructions: any[];
  accounts: any[];
  types: any[];
}

// Load the IDL file to get the program's interface
const idlPath = path.resolve(__dirname, '../target/idl/immutableowner.json');
const idlFile = fs.readFileSync(idlPath, 'utf8');
const idl = JSON.parse(idlFile) as ImmutableownerIDL;

// The program ID from Anchor.toml
const PROGRAM_ID = new web3.PublicKey('DzGaPaKJWsZiQmCPWYwasiEuRcNjTsvTV6imSdsL4nhu');

/**
 * A client for the credential system
 */
export class CredentialClient {
  private connection: web3.Connection;
  private wallet: anchor.Wallet;
  private program: Program<ImmutableownerIDL>;

  constructor(
    connection: web3.Connection,
    wallet: anchor.Wallet
  ) {
    this.connection = connection;
    this.wallet = wallet;

    // Create the program interface
    const provider = new AnchorProvider(
      connection,
      wallet,
      { commitment: 'confirmed' }
    );
    
    // Properly construct the Program with the correct type
    this.program = new Program<ImmutableownerIDL>(
      idl as ImmutableownerIDL,
      PROGRAM_ID,
      provider
    );
  }

  /**
   * Initialize a new credential mint for a specific type of credential
   * 
   * @param credentialName Name of the credential for logging purposes
   * @returns The public key of the created mint
   */
  async initializeCredentialMint(credentialName: string): Promise<web3.PublicKey> {
    console.log(`Initializing new credential mint for: ${credentialName}`);
    
    // Generate a new keypair for the mint
    const mintKeypair = web3.Keypair.generate();
    const mint = mintKeypair.publicKey;
    
    try {
      // Initialize the credential mint with 0 decimals (each credential is a whole token)
      const tx = await this.program.methods
        .initializeCredentialMint(0)
        .accounts({
          authority: this.wallet.publicKey,
          mint: mint,
          tokenProgram: token.TOKEN_2022_PROGRAM_ID,
          systemProgram: web3.SystemProgram.programId,
          rent: web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([mintKeypair])
        .rpc();
      
      console.log(`Credential mint initialized with tx: ${tx}`);
      console.log(`Mint address: ${mint.toString()}`);
      return mint;
    } catch (error) {
      console.error('Error initializing credential mint:', error);
      throw error;
    }
  }

  /**
   * Issue a credential to a user
   * 
   * @param user The user's public key
   * @param mint The credential mint
   * @returns The transaction signature
   */
  async issueCredential(
    user: web3.PublicKey,
    mint: web3.PublicKey
  ): Promise<string> {
    console.log(`Issuing credential to user: ${user.toString()}`);
    
    // Get the user's associated token account
    const associatedTokenAccount = token.getAssociatedTokenAddressSync(
      mint,
      user,
      true, // allowOwnerOffCurve
      token.TOKEN_2022_PROGRAM_ID
    );
    
    try {
      // Check if the token account already exists
      const tokenAccountInfo = await this.connection.getAccountInfo(associatedTokenAccount);
      
      // If the token account doesn't exist, create it first
      if (!tokenAccountInfo) {
        console.log('Creating token account with immutable owner extension...');
        
        const createAtaIx = token.createAssociatedTokenAccountInstruction(
          this.wallet.publicKey, // payer
          associatedTokenAccount, // associatedToken
          user, // owner
          mint, // mint
          token.TOKEN_2022_PROGRAM_ID // programId
        );
        
        const createAtaTx = new web3.Transaction().add(createAtaIx);
        const createAtaTxSig = await this.connection.sendTransaction(
          createAtaTx,
          [this.wallet.payer]
        );
        
        await this.connection.confirmTransaction(createAtaTxSig);
        console.log(`Created token account with tx: ${createAtaTxSig}`);
      }
      
      // Issue the credential by minting 1 token to the user's account
      const tx = await this.program.methods
        .issueCredential(new BN(1)) // Issue 1 token (the credential)
        .accounts({
          authority: this.wallet.publicKey,
          user: user,
          mint: mint,
          tokenAccount: associatedTokenAccount,
          createAccountForCredential: null, // We created the account above if needed
          tokenProgram: token.TOKEN_2022_PROGRAM_ID,
          systemProgram: web3.SystemProgram.programId,
          rent: web3.SYSVAR_RENT_PUBKEY,
        })
        .rpc();
      
      console.log(`Credential issued with tx: ${tx}`);
      return tx;
    } catch (error) {
      console.error('Error issuing credential:', error);
      throw error;
    }
  }

  /**
   * Verify that a user has a specific credential
   * 
   * @param user The user's public key
   * @param mint The credential mint to verify
   * @returns True if verification passes, false if it fails
   */
  async verifyCredential(
    user: web3.PublicKey,
    mint: web3.PublicKey
  ): Promise<boolean> {
    console.log(`Verifying credential for user: ${user.toString()}`);
    
    // Get the user's associated token account
    const associatedTokenAccount = token.getAssociatedTokenAddressSync(
      mint,
      user,
      true,
      token.TOKEN_2022_PROGRAM_ID
    );
    
    try {
      // Call the verify_credential instruction
      const tx = await this.program.methods
        .verifyCredential()
        .accounts({
          user: user,
          mint: mint,
          tokenAccount: associatedTokenAccount,
          tokenProgram: token.TOKEN_2022_PROGRAM_ID,
        })
        .rpc();
      
      console.log(`Credential verified with tx: ${tx}`);
      return true;
    } catch (error) {
      console.error('Credential verification failed:', error);
      return false;
    }
  }

  /**
   * Get information about a user's credential
   * 
   * @param user The user's public key
   * @param mint The credential mint
   * @returns The credential information or null if not found
   */
  async getCredentialInfo(
    user: web3.PublicKey,
    mint: web3.PublicKey
  ): Promise<{ amount: number } | null> {
    // Get the user's associated token account
    const associatedTokenAccount = token.getAssociatedTokenAddressSync(
      mint,
      user,
      true,
      token.TOKEN_2022_PROGRAM_ID
    );
    
    try {
      // Get the token account info
      const accountInfo = await this.connection.getAccountInfo(associatedTokenAccount);
      
      if (!accountInfo) {
        return null;
      }
      
      // Parse the token account data
      const tokenAccountInfo = token.unpackAccount(associatedTokenAccount, accountInfo);
      
      return {
        amount: Number(tokenAccountInfo.amount)
      };
    } catch (error) {
      console.error('Error getting credential info:', error);
      return null;
    }
  }
}

// Example usage:
async function main() {
  // Connect to the Solana network
  const connection = new web3.Connection('http://localhost:8899', 'confirmed');
  
  // Set up a wallet
  const keypair = web3.Keypair.generate();
  const wallet = new anchor.Wallet(keypair);

  // Request an airdrop to fund the wallet (this only works in local development)
  const airdropSignature = await connection.requestAirdrop(
    wallet.publicKey,
    web3.LAMPORTS_PER_SOL * 2
  );
  await connection.confirmTransaction(airdropSignature);
  
  // Create the client
  const client = new CredentialClient(connection, wallet);
  
  // Initialize a credential mint for "Identity Verification"
  const credentialMint = await client.initializeCredentialMint("Identity Verification");
  
  // Create a user
  const userKeypair = web3.Keypair.generate();
  const user = userKeypair.publicKey;
  
  // Issue a credential to the user
  await client.issueCredential(user, credentialMint);
  
  // Verify the user's credential
  const verified = await client.verifyCredential(user, credentialMint);
  
  if (verified) {
    console.log('✅ User credential verified!');
    
    // Get the credential info
    const info = await client.getCredentialInfo(user, credentialMint);
    console.log('Credential info:', info);
  } else {
    console.log('❌ User credential verification failed!');
  }
}

// Uncomment to run the example:
// main().catch(console.error);

export { main }; 