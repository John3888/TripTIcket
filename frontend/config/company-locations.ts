export type CompanyLocationKind = "branch" | "sister-company" | "main";

export interface CompanyLocation {
  /** Keep each ID unique, including when you duplicate an entry. */
  id: string;
  kind: CompanyLocationKind;
  name: string;
  latitude: number;
  longitude: number;
  address?: string;
  /** Put logos in public/assets/company-locations and use /assets/... here. */
  logoUrl: string;
  /** Change to false after replacing this entry with a real company location. */
  isPlaceholder: boolean;
}

/**
 * EDIT YOUR COMPANY MAP HERE.
 * Add, duplicate, or remove entries to list every branch and sister company.
 * Replace the name, latitude, longitude, and logoUrl, then set isPlaceholder
 * to false. Coordinates use decimal degrees: latitude -90..90, longitude
 * -180..180. These four Metro Manila positions are illustrations only;
 * they do not identify real company sites. Restart/rebuild after editing.
 * they do not identify real company sites. Development refreshes automatically;
 * rebuild and restart the frontend after editing a production deployment.
 */
export const companyLocations: readonly CompanyLocation[] = [
    {
    id: "emb-main",
    kind: "branch",
    name: "EMB MAIN",
    latitude: 10.662087,
    longitude: 122.951214,
    address: "Location (Trial)",
    logoUrl: "/assets/emb-logo.png",
    isPlaceholder: false,
  },
  {
    id: "emb-iloilo",
    kind: "branch",
    name: "EMB-Iloilo",
    latitude: 10.691670299848544, 
    longitude: 122.5730437112527,
    logoUrl: "/assets/emb-logo.png",
    isPlaceholder: true,
  },
  {
    id: "seriamus",
    kind: "sister-company",
    name: "SERVIAMUS Medical Clinic & Laboratory",
    latitude: 10.661724884176055,
    longitude: 122.9505897116413,
    logoUrl: "/assets/serviamus.jpeg",
    isPlaceholder: false,
  },
{
  id: "emb-san-carlos",
  kind: "branch",
  name: "EMB San Carlos",
  latitude: 10.49085012906524,
  longitude: 123.41175239600655,
  logoUrl: "/assets/emb-logo.png",
  isPlaceholder: true,
},
 {
    id: "emb-lacastellana",
    kind: "branch",
    name: "EMB La Castellana",
    latitude: 10.323558458375286,
    longitude: 123.02014358251338,
    logoUrl: "/assets/emb-logo.png",
    isPlaceholder: false,
  },
{
    id: "emb-bais",
    kind: "branch",
    name: "EMB Bais",
    latitude:  9.591044189068576,
    longitude: 123.12569058064986,
    logoUrl: "/assets/emb-logo.png",
    isPlaceholder: false,
  },
{
    id: "emb-siplay",
    kind: "branch",
    name: "EMB Siplay",
    latitude:  9.751108083983484,
    longitude: 122.40162738250622,
    logoUrl: "/assets/emb-logo.png",
    isPlaceholder: false,
},  
{
    id: "emb-dumaguete",
    kind: "branch",
    name: "EMB Dumaguete",
    latitude:  9.311562565145508,
    longitude: 123.29919152297374,
    logoUrl: "/assets/emb-logo.png",
    isPlaceholder: false,
},
{
    id: "emb-victorias",
    kind: "branch",
    name: "EMB Victories",
    latitude:  10.901570744487444, 
    longitude: 123.07407069570435,
    logoUrl: "/assets/emb-logo.png",
    isPlaceholder: false,
},
{
    id: "emb-talisay",
    kind: "branch",
    name: "EMB Talisay",
    latitude:  10.739535977177463,
    longitude: 122.96639616014392,
    logoUrl: "/assets/emb-logo.png",
    isPlaceholder: false,
},
{
    id: "emb-tagbilaran",
    kind: "branch",
    name: "EMB Tagbilaran",
    latitude:  9.648656372614411,
    longitude: 123.85865030000001,
    logoUrl: "/assets/emb-logo.png",
    isPlaceholder: false,
},


// {
//     id: "emb-angat",
//     kind: "branch",
//     name: "EMB Angat",
//     latitude:  14.928577935221542,
//     longitude: 121.02856804996635,
//     logoUrl: "/assets/emb-logo.png",
//     isPlaceholder: false,
// },
// {
//     id: "place holder",
//     kind: "branch",
//     name: "EMB Angat",
//     latitude:  14.968577935221542,
//     longitude: 121.07856804996635,
//     logoUrl: "/assets/emb-logo.png",
//     isPlaceholder: false,
// },


];