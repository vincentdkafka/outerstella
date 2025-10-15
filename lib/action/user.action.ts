//account flow
"use server";

import { ID, Query } from "node-appwrite";
import { createadminClient, createSessionClient } from "../appwrite";
import { appwriteConfig } from "../appwrite/config";
import { parseStringify } from "../utils";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const getUserByEmail = async (email: string) => {
  const { databases } = await createadminClient();

  const result = await databases.listDocuments(
    appwriteConfig.databaseId,
    appwriteConfig.userCollectionId,
    [Query.equal("email", [email])]
  );

  return result.total > 0 ? result.documents[0] : null;
};

const handleError = (error: unknown, message: string) => {
  console.log(error, message);
  throw error;
};

export const sendEmailOTP = async ({ email, accountId }: { email: string; accountId?: string }) => {
  const { account } = await createadminClient();

  try {
    const targetAccountId = accountId ?? ID.unique();
    const session = await account.createEmailToken(targetAccountId, email);

    return session.userId;
  } catch (error) {
    handleError(error, "failed to send email OTP");
  }
};

export const createAcount = async ({
  fullName,
  email,
}: {
  fullName: string;
  email: string;
}) => {
  const existingUser = await getUserByEmail(email);

  if (existingUser) {
    const sentForExisting = await sendEmailOTP({ email, accountId: existingUser.accountId });
    if (!sentForExisting) throw new Error("failed to send an OTP");
    return parseStringify({ accountId: existingUser.accountId });
  }

  const newAccountId = await sendEmailOTP({ email });
  if (!newAccountId) throw new Error("failed to send an OTP");

  const { databases } = await createadminClient();

  await databases.createDocument(
    appwriteConfig.databaseId,
    appwriteConfig.userCollectionId,
    ID.unique(),
    {
      fullName,
      email,
      avatar:
        "https://www.shutterstock.com/image-vector/young-smiling-man-avatar-brown-600nw-2261401207.jpg",
      accountId: newAccountId,
    }
  );

  return parseStringify({ accountId: newAccountId });
};

export const verifySecret = async ({
  accountId,
  password,
}: {
  accountId: string;
  password: string;
}) => {
  try {
    const { account } = await createadminClient();

    const session = await account.createSession(accountId, password);

    (await cookies()).set("appwrite-session", session.secret, {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
    });

    return parseStringify({ sessionId: session.$id });
  } catch (error) {
    return null;
  }
};

export const getCurrentUser = async () => {
  try {
    const { databases, account } = await createSessionClient();

    const result = await account.get();

    const user = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.userCollectionId,
      [Query.equal("accountId", result.$id)]
    );

    if (user.total <= 0) return null;

    return parseStringify(user.documents[0]);
  } catch (error) {
    return null;
  }
};

export const signOutUser = async () => {
  try {
    const { account } = await createSessionClient();
    await account.deleteSession("current");
    (await cookies()).delete("appwrite-session");
  } catch (error) {
    handleError(error, "failed to sign oout user");
  } finally {
    redirect("/sign-in");
  }
};

export const SignInUser = async ({ email }: { email: string }) => {
  try {
    const existingUser = await getUserByEmail(email);

    if (existingUser) {
      await sendEmailOTP({ email, accountId: existingUser.accountId });
      return parseStringify({ accountId: existingUser.accountId });
    }

    return parseStringify({ accountId: null, error: "User not Found" });
  } catch (error) {
    handleError(error, "failed to sign-0in user");
  }
};
