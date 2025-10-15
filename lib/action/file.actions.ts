"use server";

import { DeleteFileProps, RenameFileProps, UpdateFileUsersProps, UploadFileProps } from "@/types";
import { createadminClient } from "../appwrite";
import { InputFile } from "node-appwrite/file";
import { appwriteConfig } from "../appwrite/config";
import { ID, Models, Query } from "node-appwrite";
import { constructFileUrl, getFileType, parseStringify } from "../utils";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "./user.action";

const handleError = (error: unknown, message: string) => {
  console.log(error, message);
  throw error;
};

export const uploadFile = async ({
  file,
  ownerId,
  accountId,
  path,
}: UploadFileProps) => {
  const { storage, databases } = await createadminClient();

  try {
    const inputFile = InputFile.fromBuffer(file, file.name);
    const bucketFile = await storage.createFile(
      appwriteConfig.bucketId,
      ID.unique(),
      inputFile,
    );


    const fileDocument = {
        type: getFileType(bucketFile.name).type,
        name: bucketFile.name,
        url: constructFileUrl(bucketFile.$id),
        extension: getFileType(bucketFile.name).extension,
        size: bucketFile.sizeOriginal,
        owner: ownerId,
        accountId,
        bucketFileId: bucketFile.$id
    };

    const newFile = await databases.createDocument(
      appwriteConfig.databaseId,
      appwriteConfig.filesCollectionId,
      ID.unique(),
      fileDocument,

    )
    .catch(async(error: unknown)=>{
      await storage.deleteFile(appwriteConfig.bucketId, bucketFile.$id);

      handleError(error, "failed to create file document")
    })

    revalidatePath(path)

    return parseStringify(newFile)
  } catch (error) {
    handleError(error, "Failed to upload file");
  }
};


const createQueries =(currentUser: Models.Document)=>{
  const queries = [
    Query.or([
      Query.equal('owner', [currentUser.$id]),
      Query.contains('users', [currentUser.email]),
    ])
  ];

  return queries;

}

export const getFiles = async() =>{
  const {databases} = await createadminClient();

  try {
    const currentUser = await getCurrentUser()
    if(!currentUser) throw new Error("User not found")

      const queries = createQueries(currentUser)

      const files = await databases.listDocuments(
        appwriteConfig.databaseId,
        appwriteConfig.filesCollectionId,
        queries,

      );

      return parseStringify(files)


  } catch (error) {
    handleError(error, "failed to get files")
    
  }

}


export const renameFile = async ({fileId, name, extension, path}: RenameFileProps) =>{
  const {databases} = await createadminClient()

  try {
    const newName = `${name}.${extension}`
    const updatedFile = await databases.updateDocument(
      appwriteConfig.databaseId,
      appwriteConfig.filesCollectionId,
      fileId,
      {
        name: newName
      },
    )

    revalidatePath(path)
    return parseStringify(updatedFile)
    
  } catch (error) {
    handleError(error, "failed to rename file")
    
  }

}


export const UpdateFileUsers = async ({fileId, emails, path}: UpdateFileUsersProps) =>{
  const {databases} = await createadminClient()

  try {
    const updatedFile = await databases.updateDocument(
      appwriteConfig.databaseId,
      appwriteConfig.filesCollectionId,
      fileId,
      {
        users: emails
      },
    )

    revalidatePath(path)
    return parseStringify(updatedFile)
    
  } catch (error) {
    handleError(error, "failed to rename file")
    
  }

}

export const deleteFile = async ({fileId, bucketFileId, path}: DeleteFileProps) =>{
  const {databases, storage} = await createadminClient()

  try {
    const deletedFile = await databases.deleteDocument(
      appwriteConfig.databaseId,
      appwriteConfig.filesCollectionId,
      fileId,
    )

    if(deletedFile){
      await storage.deleteFile(appwriteConfig.bucketId, bucketFileId)
    }

    revalidatePath(path)
    return parseStringify({status: 'success'})
    
  } catch (error) {
    handleError(error, "failed to delete file")
    
  }

}