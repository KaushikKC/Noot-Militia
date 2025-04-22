"use client";
import React, { useState, useEffect, ReactNode } from "react";
import { useAccount } from "wagmi";
import { useEthersSigner } from "@/utils/signer";
import { ethers, Contract, ContractInterface } from "ethers";

// Define a proper interface with the methods we want to expose
interface DataContextProps {
  getContractInstance: (
    contractAddress: string,
    contractAbi: ContractInterface
  ) => Promise<Contract | undefined>;
  activeChain?: number;
}

interface DataContextProviderProps {
  children: ReactNode;
}

// Context initialization with proper typing
const DataContext = React.createContext<DataContextProps | undefined>(
  undefined
);

const DataContextProvider: React.FC<DataContextProviderProps> = ({
  children,
}) => {
  const { chain } = useAccount();
  const [activeChain, setActiveChainId] = useState<number | undefined>(
    chain?.id
  );

  useEffect(() => {
    setActiveChainId(chain?.id);
  }, [chain?.id]);

  const signer = useEthersSigner({ chainId: activeChain });

  const getContractInstance = async (
    contractAddress: string,
    contractAbi: ContractInterface
  ): Promise<Contract | undefined> => {
    try {
      if (!signer) {
        console.log("No signer available");
        return undefined;
      }

      const contractInstance = new ethers.Contract(
        contractAddress,
        contractAbi,
        signer
      );
      return contractInstance;
    } catch (error: unknown) {
      console.log("Error in deploying contract", error);
      return undefined;
    }
  };

  // Create the context value object
  const contextValue: DataContextProps = {
    getContractInstance,
    activeChain,
  };

  return (
    <DataContext.Provider value={contextValue}>{children}</DataContext.Provider>
  );
};

export const useDataContext = () => {
  const context = React.useContext(DataContext);
  if (context === undefined) {
    throw new Error("useDataContext must be used within a DataContextProvider");
  }
  return context;
};

export default DataContextProvider;
