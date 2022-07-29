/**
 * Insert fake data into CosmosDB database emulator.
 */
// tslint:disable: no-submodule-imports object-literal-sort-keys no-let
import * as dotenv from "dotenv";
dotenv.config();

import * as TE from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { wrapWithKind } from "@pagopa/io-functions-commons/dist/src/utils/types";
import * as E from "fp-ts/lib/Either";
import {
  CollectionMeta,
  DocumentClient as DocumentDBClient,
  UriFactory,
} from "documentdb";
import { Either, left, right } from "fp-ts/lib/Either";
import {
  PROFILE_COLLECTION_NAME,
  ProfileModel,
  Profile,
} from "@pagopa/io-functions-commons/dist/src/models/profile";
import {
  SERVICE_COLLECTION_NAME,
  ServiceModel,
  Service,
  NewService,
} from "@pagopa/io-functions-commons/dist/src/models/service";
import {
  MESSAGE_COLLECTION_NAME,
  MessageModel,
  NewMessageWithoutContent,
} from "@pagopa/io-functions-commons/dist/src/models/message";
import {
  MESSAGE_STATUS_COLLECTION_NAME,
  MessageStatusModel,
  MessageStatus,
  NewMessageStatus,
} from "@pagopa/io-functions-commons/dist/src/models/message_status";
import {
  NOTIFICATION_COLLECTION_NAME,
  NotificationModel,
  NewNotification,
} from "@pagopa/io-functions-commons/dist/src/models/notification";
import {
  NOTIFICATION_STATUS_COLLECTION_NAME,
  NotificationStatusModel,
  NotificationStatus,
  NewNotificationStatus,
} from "@pagopa/io-functions-commons/dist/src/models/notification_status";
// import * as documentDbUtils from "@pagopa/io-functions-commons/dist/src/utils/documentdb";
import { getRequiredStringEnv } from "@pagopa/io-functions-commons/dist/src/utils/env";
// import { toString } from "fp-ts/lib/function";
import * as PR from "io-ts/PathReporter";

import * as ulid from "ulid";
import * as faker from "faker";
import * as randomstring from "randomstring";

import { IWithinRangeStringTag, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { FiscalCode } from "@pagopa/io-functions-commons/dist/generated/definitions/FiscalCode";
import { MessageStatusValueEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageStatusValue";
import { NotificationChannelStatusValueEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/NotificationChannelStatusValue";

import {
  createBlobService,
  createQueueService,
  createTableService,
} from "azure-storage";
import { MessageContent } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageContent";
import { CosmosClient } from "@azure/cosmos";
import { pipe } from "fp-ts/lib/function";
import { CosmosdbModelVersioned } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model_versioned";
import { BaseModel } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { NewMessageContent } from "@pagopa/io-functions-commons/dist/generated/definitions/NewMessageContent";

const cosmosDbKey = getRequiredStringEnv("COSMOSDB_KEY");
const cosmosDbUri = getRequiredStringEnv("COSMOSDB_URI");
const cosmosDbName = getRequiredStringEnv("COSMOSDB_NAME");

const dbClient = new CosmosClient({
  endpoint: cosmosDbUri,
  key: cosmosDbKey
})

const dbInstance = dbClient.database(cosmosDbName);

const documentClient = new DocumentDBClient(cosmosDbUri, {
  masterKey: cosmosDbKey,
});

const storageConnectionString = getRequiredStringEnv(
  "STORAGE_CONNECTION_STRING"
);
const blobService = createBlobService(storageConnectionString);
const queueService = createQueueService(storageConnectionString);
const tableService = createTableService(storageConnectionString);

/**
 * Generate a fake fiscal code.
 * Avoids collisions with real ones as we use
 * a literal "Y" for the location field.
 */
function generateFakeFiscalCode(): FiscalCode {
  const s = randomstring.generate({
    capitalization: "uppercase",
    charset: "alphabetic",
    length: 6,
  });
  const d = randomstring.generate({
    charset: "numeric",
    length: 7,
  });
  return [s, d[0], d[1], "A", d[2], d[3], "Y", d[4], d[5], d[6], "X"].join(
    ""
  ) as FiscalCode;
}

function createDatabase(databaseName: string): Promise<Either<Error, void>> {
  return new Promise((resolve) => {
    documentClient.createDatabase({ id: databaseName }, (err, _) => {
      if (err) {
        return resolve(left<Error, void>(new Error(err.body)));
      }
      resolve(right<Error, void>(void 0));
    });
  });
}

function createCollection(
  collectionName: string,
  partitionKey: string
): Promise<Either<Error, CollectionMeta>> {
  return new Promise((resolve) => {
    const dbUri = UriFactory.createDatabaseUri(cosmosDbName);
    documentClient.createCollection(
      dbUri,
      {
        id: collectionName,
        partitionKey: {
          kind: "Hash",
          paths: [`/${partitionKey}`],
        },
      },
      (err, ret) => {
        if (err) {
          return resolve(left<Error, CollectionMeta>(new Error(err.body)));
        }
        resolve(right<Error, CollectionMeta>(ret));
      }
    );
  });
}


const serviceCollection = dbInstance.container(SERVICE_COLLECTION_NAME);
const serviceModel = new ServiceModel(serviceCollection);

const getServiceFixture = (s?: Partial<Service>): NewService =>
  pipe(NewService.decode({
    authorizedCIDRs: [],
    authorizedRecipients: [],
    departmentName: faker.random.words(2),
    isVisible: true,
    maxAllowedPaymentAmount: faker.random.number({ min: 1, max: 10000 }),
    organizationFiscalCode: randomstring.generate({
      charset: "numeric",
      length: 11,
    }),
    organizationName: faker.company.companyName(),
    requireSecureChannels: faker.random.boolean(),
    serviceId: ulid.ulid(),
    serviceName: faker.company.bsBuzz(),
    ...s,
  }),
    E.getOrElseW((err) => {
      throw new Error(`Cannot decode service payload: ${PR.failure(err).join("\n")}`)
    })
  )

const profilesCollection = dbInstance.container(PROFILE_COLLECTION_NAME)
const profileModel = new ProfileModel(profilesCollection);

const getProfileFixture = (p?: Partial<Profile>): Profile =>
  pipe(Profile.decode({
    acceptedTosVersion: faker.random.number(2),
    email: faker.internet.exampleEmail(),
    fiscalCode: generateFakeFiscalCode(),
    isEmailEnabled: faker.random.boolean(),
    isEmailValidated: faker.random.boolean(),
    isInboxEnabled: faker.random.boolean(),
    isWebhookEnabled: faker.random.boolean(),
    blockedInboxOrChannels: {
      [ulid.ulid()]: [faker.random.arrayElement(["WEBHOOK", "EMAIL"])],
    },
    ...p,
  }),
    E.getOrElseW(err => {
      throw new Error(`Cannot decode profile payload: ${PR.failure(err).join("\n")}`)
    })
  )

const messageCollection = dbInstance.container(MESSAGE_COLLECTION_NAME)
const messageModel = new MessageModel(
  messageCollection,
  // tslint:disable-next-line: no-any
  "message-content" as any
);

const getMessageFixture = (
  m: Partial<NewMessageWithoutContent>
): NewMessageWithoutContent =>
  pipe(
    NewMessageWithoutContent.decode({
      id: ulid.ulid(),
      indexedId: ulid.ulid(),
      fiscalCode: generateFakeFiscalCode(),
      createdAt: faker.date.past(),
      senderServiceId: faker.random.word() as NewMessageWithoutContent["senderServiceId"],
      senderUserId: faker.random.word() as NewMessageWithoutContent["senderUserId"],
      isPending: faker.random.boolean(),
      timeToLiveSeconds: faker.random.number({
        min: 3600,
        max: 10000,
      }) as NewMessageWithoutContent["timeToLiveSeconds"],
      ...m,
    }),
    E.getOrElseW(err => {
      throw new Error(`Cannot decode profile payload: ${PR.failure(err).join("\n")}`)
    })
  )

const messageStatusCollection = dbInstance.container(MESSAGE_STATUS_COLLECTION_NAME)
const messageStatusModel = new MessageStatusModel(
  messageStatusCollection
);

const getMessageStatusFixture = (ms?: Partial<MessageStatus>): NewMessageStatus =>
  pipe(
    NewMessageStatus.decode({
      messageId: ulid.ulid(),
      status: faker.random.arrayElement([
        MessageStatusValueEnum.ACCEPTED,
        MessageStatusValueEnum.FAILED,
        MessageStatusValueEnum.PROCESSED,
        MessageStatusValueEnum.REJECTED,
        MessageStatusValueEnum.THROTTLED,
      ]),
      updatedAt: faker.date.past(),
      ...ms,
    }),
    E.getOrElseW(err => {
      throw new Error(`Cannot decode message status payload: ${PR.failure(err).join("\n")}`)
    })
  )

const notificationCollection = dbInstance.container(NOTIFICATION_COLLECTION_NAME)
const notificationModel = new NotificationModel(
  notificationCollection
);

const getNotificationFixture = (
  n?: Partial<NewNotification>
): NewNotification =>
  pipe(
    NewNotification.decode({
      id: ulid.ulid(),
      fiscalCode: generateFakeFiscalCode(),
      messageId: ulid.ulid(),
      channels: {
        EMAIL: {
          addressSource: "PROFILE_ADDRESS",
          toAddress: faker.internet.exampleEmail(),
        },
        WEBHOOK: {
          url: "https://app-backend.io.italia.it/api/v1/notify?token=seceret",
        },
      },
      ...n,
    }),
    E.getOrElseW(err => {
      throw new Error(`Cannot decode notification payload: ${PR.failure(err).join("\n")}`)
    })
  )

const notificationStatusCollection = dbInstance.container(NOTIFICATION_STATUS_COLLECTION_NAME)
const notificationStatusModel = new NotificationStatusModel(
  notificationStatusCollection
);

const getNotificationStatusFixture = (
  n?: Partial<NotificationStatus>
): NewNotificationStatus =>
  pipe(
    NewNotificationStatus.decode({
      statusId: ulid.ulid(),
      messageId: ulid.ulid(),
      updatedAt: faker.date.past(),
      status: faker.random.arrayElement([
        NotificationChannelStatusValueEnum.EXPIRED,
        NotificationChannelStatusValueEnum.FAILED,
        NotificationChannelStatusValueEnum.THROTTLED,
        NotificationChannelStatusValueEnum.SENT,
      ]),
      channel: faker.random.arrayElement(["EMAIL", "WEBHOOK"]),
      ...n,
    }),
    E.getOrElseW(err => {
      throw new Error(`Cannot decode notification status payload: ${PR.failure(err).join("\n")}`)
    })
  )

const generateServiceFixtures = async (s?: Partial<Service>) => {
  const aService = getServiceFixture(s);

  // create a new version
  await pipe(
    serviceModel.create(
      aService
    ),
    TE.mapLeft(() => {
      throw new Error("cannot create new service");
    }),
    TE.map(service => serviceModel.update(
      service
    ))
  )()
};

const generateMessageContentFixture = (): NewMessageContent => {
  return pipe(NewMessageContent.decode({
    markdown: faker.lorem.words(100),
    subject: faker.lorem.words(5)
  }),
    E.getOrElseW(() => {
      throw new Error("Cannot generate message content payload")
    })
  )
};

const generateMessageFixtures = async (fiscalCode: FiscalCode) => {
  const aMessage = getMessageFixture({
    fiscalCode
  });

  await pipe(
    messageModel.create(aMessage),
    TE.chainW(() => {
      return messageModel.storeContentAsBlob(
        blobService,
        aMessage.id,
        generateMessageContentFixture()
      )
    }),
    TE.chainW(() => {
      const aMessageStatus = getMessageStatusFixture({ messageId: aMessage.id });

      return messageStatusModel.create(
        aMessageStatus
      )
    }),
    //create a new version
    TE.chainW(createdMessageStatus =>
      messageStatusModel.update(
        createdMessageStatus
      )
    ),
    TE.bindW("aNotification", () => TE.of(getNotificationFixture({ messageId: aMessage.id, fiscalCode: aMessage.fiscalCode }))),
    TE.chainFirstW(({ aNotification }) => notificationModel.create(aNotification)),
    TE.bindW("aNotificationStatus", ({ aNotification }) => TE.of(getNotificationStatusFixture({ messageId: aMessage.id, notificationId: aNotification.id }))),
    TE.bindW("createdNotificationStatus", ({ aNotificationStatus }) => notificationStatusModel.create(aNotificationStatus)),
    TE.mapLeft((err) => {
      throw new Error("Cannot create new notification status" + err);
    }),
    TE.chainFirstW(({ createdNotificationStatus }) => notificationStatusModel.update(createdNotificationStatus))
  )()

  return aMessage.id

  // ------------------------
  // OLD CODE
  // ------------------------

  // await messageModel.create(aMessage, aMessage.fiscalCode);
  // await messageModel.storeContentAsBlob(
  //   blobService,
  //   aMessage.id,
  //   generateMessageContentFixture()
  // );

  // const aMessageStatus = getMessageStatusFixture({
  //   messageId: aMessage.id,
  // });
  // const errorOrMessageStatus = await messageStatusModel.create(
  //   aMessageStatus,
  //   aMessageStatus.messageId
  // );

  // const createdMessageStatus = errorOrMessageStatus.getOrElseL(() => {
  //   throw new Error("cannot create new message status");
  // });
  // // create a new version
  // await messageStatusModel.update(
  //   createdMessageStatus.id,
  //   createdMessageStatus.messageId,
  //   () => createdMessageStatus
  // );

  // const aNotification = getNotificationFixture({
  //   messageId: aMessage.id,
  //   fiscalCode: aMessage.fiscalCode,
  // });
  // await notificationModel.create(aNotification, aNotification.messageId);

  // const aNotificationStatus = getNotificationStatusFixture({
  //   messageId: aMessage.id,
  //   notificationId: aNotification.id,
  // });
  // const errorOrNotifcationStatus = await notificationStatusModel.create(
  //   aNotificationStatus,
  //   aNotificationStatus.notificationId
  // );

  // const createdNotificationStatus = errorOrNotifcationStatus.getOrElseL(
  //   (err) => {
  //     throw new Error("cannot create new notification status:" + toString(err));
  //   }
  // );
  // create a new version
  // await notificationStatusModel.update(
  //   createdNotificationStatus.id,
  //   createdNotificationStatus.notificationId,
  //   () => createdNotificationStatus
  // );

  // return aMessage.id;
};

const generateUserFixtures = async () => {
  const aProfile = getProfileFixture();
  await profileModel.create(aProfile, aProfile.fiscalCode);
  return aProfile.fiscalCode;
};

const generateUserMessageFixtures = async () => {
  for (let nusers = 0; nusers < 10; nusers++) {
    const fiscalCode = await generateUserFixtures();
    for (let nmessages = 0; nmessages < 10; nmessages++) {
      await generateMessageFixtures(fiscalCode);
    }
  }
};

const createContainer = (containerName: string) =>
  new Promise<void>((resolve) =>
    blobService.createContainerIfNotExists(containerName, (err) =>
      // tslint:disable-next-line: no-use-of-empty-return-value no-console
      err ? resolve(console.error(err)) : resolve()
    )
  );

const createQueue = (queueName: string) =>
  new Promise<void>((resolve) =>
    queueService.createQueueIfNotExists(queueName, (err) =>
      // tslint:disable-next-line: no-use-of-empty-return-value no-console
      err ? resolve(console.error(err)) : resolve()
    )
  );

const createTable = (tableName: string) =>
  new Promise<void>((resolve) =>
    tableService.createTableIfNotExists(tableName, (err) =>
      // tslint:disable-next-line: no-use-of-empty-return-value no-console
      err ? resolve(console.error(err)) : resolve()
    )
  );

createDatabase(cosmosDbName)
  .then(() => createCollection("message-status", "messageId"))
  .then(() => createCollection("messages", "fiscalCode"))
  .then(() => createCollection("notification-status", "notificationId"))
  .then(() => createCollection("notifications", "messageId"))
  .then(() => createCollection("profiles", "fiscalCode"))
  .then(() => createCollection("services", "serviceId"))
  .then(() => createCollection("user-data-processing", "fiscalCode"))

  .then(() => createCollection("bonus-activations", "id"))
  .then(() => createCollection("bonus-leases", "id"))
  .then(() => createCollection("bonus-processing", "id"))
  .then(() => createCollection("eligibility-checks", "id"))
  .then(() => createCollection("user-bonuses", "fiscalCode"))

  .then(() => createCollection("user-cgns", "fiscalCode"))
  .then(() => createCollection("user-eyca-cards", "fiscalCode"))

  .then(() =>
    NonEmptyString.decode(process.env.REQ_SERVICE_ID).fold(
      () => generateServiceFixtures(),
      (serviceId) => generateServiceFixtures({ serviceId })
    )
  )
  //generate special service
  .then(() =>
    NonEmptyString.decode(process.env.REQ_SPECIAL_SERVICE_ID).fold(
      () => generateServiceFixtures(),
      (serviceId) => generateServiceFixtures({ serviceId })
    )
  )

  .then(() => createContainer("spidassertions"))

  .then(() => createContainer("cached"))
  .then(() => createContainer("message-content"))

  .then(() => createContainer("user-data-download"))
  .then(() => createContainer("user-data-backup"))

  .then(() => createContainer("$web"))
  .then(() => createContainer("services"))

  .then(() => createQueue("spidmsgitems"))

  .then(() => createQueue("push-notifications"))

  .then(() => createQueue("bonusactivations"))
  .then(() => createQueue("redeemed-bonuses"))

  .then(() => createTable("SubscriptionsFeedByDay"))
  .then(() => createTable("ValidationTokens"))

  .then(() => createTable("adelogs"))
  .then(() => createTable("inpslogs"))
  .then(() => createTable("bonusactivations"))
  .then(() => createTable("bonusleasebindings"))
  .then(() => createTable("eligibilitychecks"))
  .then(() => createTable("redeemederrors"))

  .then(() => createTable("cgnleasebindings"))
  .then(() => createTable("cgnexpirations"))
  .then(() => createQueue("eycaactivations"))

  .then(() => generateUserMessageFixtures())

  // tslint:disable-next-line: no-console
  .catch(console.error);
